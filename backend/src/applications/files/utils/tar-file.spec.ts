import { link, mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { list, type ReadEntry } from 'tar'
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
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('archives files and directories', async () => {
    const directory = path.join(sourceDir, 'docs')
    await mkdir(directory)
    await writeFile(path.join(directory, 'file.txt'), 'content')

    await createTar(archivePath, [{ path: directory, name: 'docs' }], false)

    const archiveEntries = await readArchiveEntries()
    expect(archiveEntries.map(({ path }) => path)).toEqual(expect.arrayContaining(['.', 'file.txt']))
  })

  it('rejects symbolic links and hard links', async () => {
    const linkPath = path.join(sourceDir, 'link')
    const sourceFile = path.join(sourceDir, 'source.txt')
    const linkedFile = path.join(sourceDir, 'linked.txt')
    await symlink('target.txt', linkPath)
    await writeFile(sourceFile, 'content')
    await link(sourceFile, linkedFile)

    await expect(createTar(archivePath, [{ path: linkPath, name: 'link' }], false)).rejects.toThrow(
      `TAR symbolic links are not supported: ${linkPath}`
    )
    await expect(createTar(archivePath, [{ path: sourceFile, name: 'source.txt' }], false)).rejects.toThrow(
      `TAR hard links are not supported: ${sourceFile}`
    )
  })

  it('uses public root names in a multiple selection and reports progress', async () => {
    const anchoredDirectory = path.join(sourceDir, 'internal-root')
    const otherFile = path.join(sourceDir, 'other.txt')
    const onProgress = vi.fn()
    await mkdir(anchoredDirectory)
    await writeFile(path.join(anchoredDirectory, 'file.txt'), 'content')
    await writeFile(otherFile, 'other')

    await createTar(
      archivePath,
      [
        { path: anchoredDirectory, name: 'documents', rootAlias: 'shared' },
        { path: otherFile, name: 'other.txt' }
      ],
      false,
      undefined,
      onProgress
    )

    expect((await readArchiveEntries()).map(({ path }) => path).sort()).toEqual(['documents', 'documents/file.txt', 'other.txt'])
    expect(onProgress).toHaveBeenCalled()
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

  it('rejects archives exceeding the storage quota', async () => {
    const sourceFile = path.join(sourceDir, 'file.txt')
    await writeFile(sourceFile, 'content')

    await expect(createTar(archivePath, [{ path: sourceFile, name: 'file.txt' }], false, undefined, undefined, 1)).rejects.toThrow(
      'Storage quota will be exceeded'
    )
  })

  async function readArchiveEntries(): Promise<Pick<ReadEntry, 'path' | 'type'>[]> {
    const archiveEntries: Pick<ReadEntry, 'path' | 'type'>[] = []
    await list({
      file: archivePath,
      onReadEntry: (entry) => {
        archiveEntries.push({ path: entry.path, type: entry.type })
        entry.resume()
      }
    })
    return archiveEntries
  }
})
