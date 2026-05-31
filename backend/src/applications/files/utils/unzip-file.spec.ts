import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as filesUtils from './files'
import { extractZip } from './unzip-file'

function createEmptyZip(entryName: string): Buffer {
  const encodedEntryName = Buffer.from(entryName)
  const localFileHeader = Buffer.alloc(30)
  localFileHeader.writeUInt32LE(0x04034b50, 0)
  localFileHeader.writeUInt16LE(20, 4)
  localFileHeader.writeUInt16LE(encodedEntryName.length, 26)

  const centralDirectoryHeader = Buffer.alloc(46)
  centralDirectoryHeader.writeUInt32LE(0x02014b50, 0)
  centralDirectoryHeader.writeUInt16LE(20, 4)
  centralDirectoryHeader.writeUInt16LE(20, 6)
  centralDirectoryHeader.writeUInt16LE(encodedEntryName.length, 28)

  const endOfCentralDirectory = Buffer.alloc(22)
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(1, 8)
  endOfCentralDirectory.writeUInt16LE(1, 10)
  endOfCentralDirectory.writeUInt32LE(centralDirectoryHeader.length + encodedEntryName.length, 12)
  endOfCentralDirectory.writeUInt32LE(localFileHeader.length + encodedEntryName.length, 16)

  return Buffer.concat([localFileHeader, encodedEntryName, centralDirectoryHeader, encodedEntryName, endOfCentralDirectory])
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
    jest.restoreAllMocks()
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('rejects entries escaping the output directory', async () => {
    const escapedPath = path.join(tmpDir, 'zip-slip-proof.txt')
    await writeFile(archivePath, createEmptyZip('../zip-slip-proof.txt'))

    await expect(extractZip(archivePath, outputDir)).rejects.toThrow('invalid relative path: ../zip-slip-proof.txt')
    await expect(access(escapedPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('extracts entries inside the output directory', async () => {
    const extractedPath = path.join(outputDir, 'safe.txt')
    await writeFile(archivePath, createEmptyZip('safe.txt'))

    await expect(extractZip(archivePath, outputDir)).resolves.toBeUndefined()
    await expect(access(extractedPath)).resolves.toBeUndefined()
  })

  it('rejects entries outside the output directory', async () => {
    await writeFile(archivePath, createEmptyZip('safe.txt'))
    const isPathInsideSpy = jest.spyOn(filesUtils, 'isPathInside').mockReturnValueOnce(false)

    await expect(extractZip(archivePath, outputDir)).rejects.toThrow('Zip entry "safe.txt" would escape the output directory')
    expect(isPathInsideSpy).toHaveBeenCalledWith(outputDir, path.join(outputDir, 'safe.txt'), false)
  })

  it('accepts a root directory entry', async () => {
    await writeFile(archivePath, createEmptyZip('./'))
    const isPathInsideSpy = jest.spyOn(filesUtils, 'isPathInside')

    await expect(extractZip(archivePath, outputDir)).resolves.toBeUndefined()
    expect(isPathInsideSpy).toHaveBeenCalledWith(outputDir, outputDir, true)
  })
})
