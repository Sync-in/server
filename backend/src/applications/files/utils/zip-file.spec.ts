import { BlobReader, type FileEntry, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import { openAsBlob } from 'node:fs'
import { link, mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createZip } from './zip-file'

const DEFAULT_TEST_FILE_SIZE = 8 * 1024 * 1024
const UNIX_FILE_TYPE_MASK = 0o170000
const UNIX_REGULAR_FILE = 0o100000

interface ArchiveEntry {
  compressionMethod: number
  content: Buffer
  mode: number
  path: string
}

describe(createZip.name, () => {
  let tmpDir: string
  let sourceDir: string
  let archivePath: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'create-zip-'))
    sourceDir = path.join(tmpDir, 'source')
    archivePath = path.join(tmpDir, 'archive.zip')
    await mkdir(sourceDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('archives files and empty directories with the requested compression', async () => {
    const directory = path.join(sourceDir, 'docs')
    await mkdir(path.join(directory, 'empty'), { recursive: true })
    await writeFile(path.join(directory, 'file.txt'), 'content')

    await createZip(archivePath, [{ path: directory, name: 'docs' }], true)

    const archiveEntries = await readArchiveEntries()
    expect(archiveEntries.map(({ path }) => path)).toEqual(expect.arrayContaining(['empty/', 'file.txt']))
    expect(archiveEntries.find(({ path }) => path === 'file.txt')).toMatchObject({
      compressionMethod: 8,
      content: Buffer.from('content')
    })

    await createZip(archivePath, [{ path: path.join(directory, 'file.txt'), name: 'file.txt' }], false)

    expect(await readArchiveEntries()).toEqual([expect.objectContaining({ compressionMethod: 0, path: 'file.txt' })])
  })

  it('rejects symbolic links', async () => {
    const linkPath = path.join(sourceDir, 'link')
    await symlink('target.txt', linkPath)

    await expect(createZip(archivePath, [{ path: linkPath, name: 'link' }], true)).rejects.toThrow(
      `ZIP symbolic links are not supported: ${linkPath}`
    )
  })

  it('uses public root names in a multiple selection and reports progress', async () => {
    const anchoredDirectory = path.join(sourceDir, 'internal-root')
    const otherFile = path.join(sourceDir, 'other.txt')
    const onProgress = vi.fn()
    await mkdir(anchoredDirectory)
    await writeFile(path.join(anchoredDirectory, 'file.txt'), 'content')
    await writeFile(otherFile, 'other')

    await createZip(
      archivePath,
      [
        { path: anchoredDirectory, name: 'documents', rootAlias: 'shared' },
        { path: otherFile, name: 'other.txt' }
      ],
      true,
      undefined,
      onProgress
    )

    expect((await readArchiveEntries()).map(({ path }) => path)).toEqual(['documents/', 'documents/file.txt', 'other.txt'])
    expect(onProgress).toHaveBeenCalled()
  })

  it('filters entries already included in a selected directory', async () => {
    const directory = path.join(sourceDir, 'docs')
    const nestedFile = path.join(directory, 'file.txt')
    await mkdir(directory)
    await writeFile(nestedFile, 'content')

    await createZip(
      archivePath,
      [
        { path: directory, name: 'docs' },
        { path: nestedFile, name: 'renamed.txt', rootAlias: 'personal' }
      ],
      true
    )

    expect((await readArchiveEntries()).map(({ path }) => path)).toEqual(['./', 'file.txt'])
  })

  it('archives hard links as independent files', async () => {
    const sourceFile = path.join(sourceDir, 'source.txt')
    const linkedFile = path.join(sourceDir, 'linked.txt')
    await writeFile(sourceFile, 'content')
    await link(sourceFile, linkedFile)

    await createZip(
      archivePath,
      [
        { path: sourceFile, name: 'source.txt' },
        { path: linkedFile, name: 'linked.txt' }
      ],
      true
    )

    expect(await readArchiveEntries()).toEqual([
      expect.objectContaining({ content: Buffer.from('content'), mode: UNIX_REGULAR_FILE, path: 'source.txt' }),
      expect.objectContaining({ content: Buffer.from('content'), mode: UNIX_REGULAR_FILE, path: 'linked.txt' })
    ])
  })

  it('cancels an active file stream with the original reason', async () => {
    const largeFile = path.join(sourceDir, 'large.bin')
    const controller = new AbortController()
    const reason = new Error('Cancelled')
    await writeFile(largeFile, '')
    await truncate(largeFile, DEFAULT_TEST_FILE_SIZE)

    const zipPromise = createZip(archivePath, [{ path: largeFile, name: 'large.bin' }], true, controller.signal, () => {
      controller.abort(reason)
    })

    await expect(zipPromise).rejects.toBe(reason)
  })

  it('rejects empty selections and archives exceeding the storage quota', async () => {
    await expect(createZip(archivePath, [], true)).rejects.toThrow('Cannot create a ZIP archive without entries')
    const sourceFile = path.join(sourceDir, 'file.txt')
    await writeFile(sourceFile, 'content')

    await expect(createZip(archivePath, [{ path: sourceFile, name: 'file.txt' }], true, undefined, undefined, 1)).rejects.toThrow(
      'Storage quota will be exceeded'
    )
  })

  async function readArchiveEntries(): Promise<ArchiveEntry[]> {
    const zipReader = new ZipReader(new BlobReader(await openAsBlob(archivePath)))
    const archiveEntries: ArchiveEntry[] = []

    try {
      for await (const entry of zipReader.getEntriesGenerator()) {
        const content = entry.directory ? Buffer.alloc(0) : Buffer.from(await (entry as FileEntry).getData(new Uint8ArrayWriter()))
        archiveEntries.push({
          compressionMethod: entry.compressionMethod,
          content,
          mode: (entry.externalFileAttributes >>> 16) & UNIX_FILE_TYPE_MASK,
          path: entry.filename
        })
      }
      return archiveEntries
    } finally {
      await zipReader.close()
    }
  }
})
