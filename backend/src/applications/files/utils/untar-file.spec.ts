import fs from 'node:fs'
import { access, mkdir, mkdtemp, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { create } from 'tar'
import { checkTarEntry, extractTar, isTarDirectory } from './untar-file'

describe(extractTar.name, () => {
  const baseOutputDir = path.join(path.sep, 'tmp', 'output')

  it('rejects hard links', () => {
    expect(() => checkTarEntry(baseOutputDir, { type: 'Link', path: 'docs/hard-link', linkpath: 'docs/target' })).toThrow(
      'Tar entry "docs/hard-link" is a hard link'
    )
  })

  it('rejects symbolic links escaping the output directory', () => {
    expect(() => checkTarEntry(baseOutputDir, { type: 'SymbolicLink', path: 'docs/latest', linkpath: '../../../outside' })).toThrow(
      'Tar symlink entry "docs/latest" would escape the output directory'
    )
  })

  it('recognizes regular and GNU dump directories', () => {
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

  it('extracts symbolic links targeting the output directory', async () => {
    const onEntry = vi.fn()
    await symlink('./v2', path.join(sourceDir, 'docs', 'latest'))
    await createArchive()

    await extractTar(archivePath, outputDir, false, undefined, undefined, onEntry)

    await expect(readlink(path.join(outputDir, 'docs', 'latest'))).resolves.toBe('./v2')
    expect(onEntry).toHaveBeenCalledWith({ path: 'docs/', isDirectory: true, size: 0 })
    expect(onEntry).toHaveBeenCalledWith({ path: 'docs/latest', isDirectory: false, size: 0 })
  })

  it('reports decompressed file bytes through the entry transform', async () => {
    const onEntry = vi.fn()
    await writeFile(path.join(sourceDir, 'docs', 'file.txt'), 'abc')
    await createArchive()

    await extractTar(archivePath, outputDir, false, undefined, undefined, onEntry)

    expect(onEntry).toHaveBeenCalledWith({ path: 'docs/file.txt', isDirectory: false, size: 0 })
    expect(onEntry).toHaveBeenCalledWith({ path: 'docs/file.txt', isDirectory: false, size: 3 })
  })

  it('rejects symbolic links escaping the output directory', async () => {
    const linkPath = path.join(outputDir, 'docs', 'latest')
    await symlink('../../../outside', path.join(sourceDir, 'docs', 'latest'))
    await createArchive()

    await expect(extractTar(archivePath, outputDir, false)).rejects.toThrow('Tar symlink entry "docs/latest" would escape the output directory')
    await expect(access(linkPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects entries exceeding the extracted size limit', async () => {
    await writeFile(path.join(sourceDir, 'docs', 'large.txt'), 'ab')
    await createArchive()
    const destroySpy = vi.spyOn(fs.ReadStream.prototype, 'destroy')

    await expect(extractTar(archivePath, outputDir, false, 1)).rejects.toThrow('Storage quota will be exceeded')
    expect(destroySpy).toHaveBeenCalled()
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
