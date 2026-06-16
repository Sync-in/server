import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { extractZip } from './unzip-file'

function createZip(entryName: string, content = Buffer.alloc(0), unixMode?: number): Buffer {
  const encodedEntryName = Buffer.from(entryName)
  const localFileHeader = Buffer.alloc(30)
  localFileHeader.writeUInt32LE(0x04034b50, 0)
  localFileHeader.writeUInt16LE(20, 4)
  localFileHeader.writeUInt32LE(content.length, 18)
  localFileHeader.writeUInt32LE(content.length, 22)
  localFileHeader.writeUInt16LE(encodedEntryName.length, 26)

  const centralDirectoryHeader = Buffer.alloc(46)
  centralDirectoryHeader.writeUInt32LE(0x02014b50, 0)
  centralDirectoryHeader.writeUInt16LE(unixMode === undefined ? 20 : (3 << 8) | 20, 4)
  centralDirectoryHeader.writeUInt16LE(20, 6)
  centralDirectoryHeader.writeUInt32LE(content.length, 20)
  centralDirectoryHeader.writeUInt32LE(content.length, 24)
  centralDirectoryHeader.writeUInt16LE(encodedEntryName.length, 28)
  if (unixMode !== undefined) centralDirectoryHeader.writeUInt32LE((unixMode << 16) >>> 0, 38)

  const endOfCentralDirectory = Buffer.alloc(22)
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(1, 8)
  endOfCentralDirectory.writeUInt16LE(1, 10)
  endOfCentralDirectory.writeUInt32LE(centralDirectoryHeader.length + encodedEntryName.length, 12)
  endOfCentralDirectory.writeUInt32LE(localFileHeader.length + encodedEntryName.length + content.length, 16)

  return Buffer.concat([localFileHeader, encodedEntryName, content, centralDirectoryHeader, encodedEntryName, endOfCentralDirectory])
}

describe(extractZip.name, () => {
  let tmpDir: string
  let archivePath: string
  let outputDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'extract-zip-'))
    archivePath = path.join(tmpDir, 'archive.zip')
    outputDir = path.join(tmpDir, 'output')
    await mkdir(outputDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('rejects path traversal and symbolic links', async () => {
    const escapedPath = path.join(tmpDir, 'zip-slip-proof.txt')
    await writeFile(archivePath, createZip('../zip-slip-proof.txt'))

    await expect(extractZip(archivePath, outputDir)).rejects.toThrow('invalid relative path: ../zip-slip-proof.txt')
    await expect(access(escapedPath)).rejects.toMatchObject({ code: 'ENOENT' })

    await writeFile(archivePath, createZip('link', Buffer.from('../../outside'), 0o120777))

    await expect(extractZip(archivePath, outputDir)).rejects.toThrow('ZIP symbolic links are not supported: link')
  })

  it('extracts files and accepts a root directory entry', async () => {
    const extractedPath = path.join(outputDir, 'safe.txt')
    const onEntry = vi.fn()
    await writeFile(archivePath, createZip('safe.txt', Buffer.from('abc')))

    await expect(extractZip(archivePath, outputDir, undefined, undefined, onEntry)).resolves.toBeUndefined()
    await expect(access(extractedPath)).resolves.toBeUndefined()
    expect(onEntry).toHaveBeenCalledWith({ path: 'safe.txt', isDirectory: false, size: 0 })
    expect(onEntry).toHaveBeenCalledWith({ path: 'safe.txt', isDirectory: false, size: 3 })

    await writeFile(archivePath, createZip('./'))

    await expect(extractZip(archivePath, outputDir)).resolves.toBeUndefined()
  })

  it('rejects entries exceeding the extracted size limit', async () => {
    await writeFile(archivePath, createZip('large.txt', Buffer.from('ab')))

    await expect(extractZip(archivePath, outputDir, 1)).rejects.toThrow('Storage quota exceeded')
  })
})
