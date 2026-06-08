import { link, mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { create, list, type ReadEntry } from 'tar'
import { createTar } from './tar-file'

const DEFAULT_TEST_FILE_SIZE = 8 * 1024 * 1024

describe(createTar.name, () => {
  let tmpDir: string
  let sourceDir: string
  let archivePath: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'create-tar-'))
    sourceDir = path.join(tmpDir, 'source')
    archivePath = path.join(tmpDir, 'archive.tar')
    await mkdir(sourceDir)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('archives files, directories and symlinks without following link targets', async () => {
    const directory = path.join(sourceDir, 'docs')
    const externalFile = path.join(tmpDir, 'external.txt')
    await mkdir(directory)
    await writeFile(path.join(directory, 'file.txt'), 'content')
    await writeFile(externalFile, 'external')
    await symlink(externalFile, path.join(directory, 'external-link'))

    await createTar(archivePath, [{ path: directory, name: 'docs' }], false)

    const archiveEntries = await readArchiveEntries()
    expect(archiveEntries.map(({ path }) => path)).toEqual(expect.arrayContaining(['.', 'file.txt', 'external-link']))
    expect(archiveEntries.find(({ path }) => path === 'external-link')).toMatchObject({
      type: 'SymbolicLink',
      linkpath: externalFile
    })
  })

  it('preserves selected root names and reports output progress', async () => {
    const firstFile = path.join(sourceDir, 'first.txt')
    const secondFile = path.join(sourceDir, 'second.txt')
    const onProgress = vi.fn()
    await writeFile(firstFile, 'first')
    await writeFile(secondFile, 'second')

    await createTar(
      archivePath,
      [
        { path: firstFile, name: 'first.txt' },
        { path: secondFile, name: 'renamed.txt', rootAlias: 'personal' }
      ],
      false,
      undefined,
      onProgress
    )

    expect((await readArchiveEntries()).map(({ path }) => path)).toEqual(['first.txt', 'renamed.txt'])
    expect(onProgress).toHaveBeenCalled()
  })

  it('passes relative source paths to node-tar in strict mode', async () => {
    const sourceFile = path.join(sourceDir, 'file.txt')
    await writeFile(sourceFile, 'content')

    await expect(createTar(archivePath, [{ path: sourceFile, name: 'file.txt' }], false)).resolves.toBeUndefined()
    expect((await readArchiveEntries()).map(({ path }) => path)).toEqual(['file.txt'])
  })

  it('filters entries already included in a selected directory', async () => {
    const directory = path.join(sourceDir, 'docs')
    const nestedFile = path.join(directory, 'file.txt')
    await mkdir(directory)
    await writeFile(nestedFile, 'content')

    await createTar(
      archivePath,
      [
        { path: directory, name: 'docs' },
        { path: nestedFile, name: 'renamed.txt', rootAlias: 'personal' }
      ],
      false
    )

    expect((await readArchiveEntries()).map(({ path }) => path)).toEqual(['.', 'file.txt'])
  })

  it('archives hard links as independent files', async () => {
    const sourceFile = path.join(sourceDir, 'source.txt')
    const linkedFile = path.join(sourceDir, 'linked.txt')
    await writeFile(sourceFile, 'content')
    await link(sourceFile, linkedFile)

    await createTar(
      archivePath,
      [
        { path: sourceFile, name: 'source.txt' },
        { path: linkedFile, name: 'linked.txt' }
      ],
      false
    )

    expect(await readArchiveEntries()).toEqual([
      expect.objectContaining({ path: 'source.txt', type: 'File' }),
      expect.objectContaining({ path: 'linked.txt', type: 'File' })
    ])
  })

  it('cancels an active file stream with the original reason', async () => {
    const largeFile = path.join(sourceDir, 'large.bin')
    const controller = new AbortController()
    const reason = new Error('Cancelled')
    await writeFile(largeFile, '')
    await truncate(largeFile, DEFAULT_TEST_FILE_SIZE)

    const tarPromise = createTar(archivePath, [{ path: largeFile, name: 'large.bin' }], false, controller.signal, () => {
      controller.abort(reason)
    })

    await expect(tarPromise).rejects.toBe(reason)
  })

  it('detects changes to the node-tar stream API used for cancellation', async () => {
    const sourceFile = path.join(sourceDir, 'file.txt')
    await writeFile(sourceFile, 'content')
    const onWriteEntry = vi.fn((entry) => {
      expect(entry.absolute).toBe(sourceFile)
      expect(typeof entry.destroy).toBe('function')
    })
    const archive = create({ cwd: sourceDir, onWriteEntry }, ['file.txt'])

    expect(typeof archive.destroy).toBe('function')
    await pipeline(
      archive,
      new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        }
      })
    )

    expect(onWriteEntry).toHaveBeenCalledOnce()
  })

  async function readArchiveEntries(): Promise<Pick<ReadEntry, 'linkpath' | 'path' | 'type'>[]> {
    const archiveEntries: Pick<ReadEntry, 'linkpath' | 'path' | 'type'>[] = []
    await list({
      file: archivePath,
      onReadEntry: (entry) => {
        archiveEntries.push({ linkpath: entry.linkpath, path: entry.path, type: entry.type })
        entry.resume()
      }
    })
    return archiveEntries
  }
})
