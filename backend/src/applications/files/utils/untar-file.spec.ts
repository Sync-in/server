import fs from 'node:fs'
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { create } from 'tar'
import { checkTarEntry, extractTar, isTarDirectory } from './untar-file'

describe(extractTar.name, () => {
  it('classifies directories and rejects link entries', () => {
    expect(() => checkTarEntry({ type: 'Link', path: 'docs/hard-link' })).toThrow('Tar entry "docs/hard-link" is a hard link')
    expect(() => checkTarEntry({ type: 'SymbolicLink', path: 'docs/latest' })).toThrow('Tar entry "docs/latest" is a symbolic link')
    expect(isTarDirectory('Directory')).toBe(true)
    expect(isTarDirectory('GNUDumpDir')).toBe(true)
    expect(isTarDirectory('File')).toBe(false)
  })

  let tmpDir: string
  let sourceDir: string
  let outputDir: string
  let archivePath: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'extract-tar-'))
    sourceDir = path.join(tmpDir, 'source')
    outputDir = path.join(tmpDir, 'output')
    archivePath = path.join(tmpDir, 'archive.tar')
    await mkdir(path.join(sourceDir, 'docs', 'v2'), { recursive: true })
    await mkdir(outputDir)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('rejects symbolic links targeting the output directory', async () => {
    await symlink('./v2', path.join(sourceDir, 'docs', 'latest'))
    await createArchive()

    await expect(extractTar(archivePath, outputDir, false)).rejects.toThrow('Tar entry "docs/latest" is a symbolic link')
    await expect(access(path.join(outputDir, 'docs', 'latest'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports decompressed file bytes through the entry transform', async () => {
    const onEntry = vi.fn()
    await writeFile(path.join(sourceDir, 'docs', 'file.txt'), 'abc')
    await createArchive()

    await extractTar(archivePath, outputDir, false, undefined, undefined, onEntry)

    expect(onEntry).toHaveBeenCalledWith({ path: 'docs/file.txt', isDirectory: false, size: 0 })
    expect(onEntry).toHaveBeenCalledWith({ path: 'docs/file.txt', isDirectory: false, size: 3 })
  })

  it('aborts TAR.GZ extraction when the extracted size limit is exceeded', async () => {
    archivePath = path.join(tmpDir, 'archive.tar.gz')
    await writeFile(path.join(sourceDir, 'docs', 'large.txt'), 'ab')
    await createArchive(true)
    const destroySpy = vi.spyOn(fs.ReadStream.prototype, 'destroy')

    await expect(extractTar(archivePath, outputDir, true, 1)).rejects.toThrow('Storage quota will be exceeded')
    expect(destroySpy).toHaveBeenCalled()
  })

  function createArchive(gzip = false): Promise<void> {
    return create({ cwd: sourceDir, file: archivePath, gzip }, ['docs'])
  }
})
