import { access, mkdir, mkdtemp, readlink, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { create } from 'tar'
import { checkTarEntry, extractTar } from './untar-file'

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
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('extracts symbolic links targeting the output directory', async () => {
    await symlink('./v2', path.join(sourceDir, 'docs', 'latest'))
    await createArchive()

    await extractTar(archivePath, outputDir, false)

    await expect(readlink(path.join(outputDir, 'docs', 'latest'))).resolves.toBe('./v2')
  })

  it('rejects symbolic links escaping the output directory', async () => {
    const linkPath = path.join(outputDir, 'docs', 'latest')
    await symlink('../../../outside', path.join(sourceDir, 'docs', 'latest'))
    await createArchive()

    await expect(extractTar(archivePath, outputDir, false)).rejects.toThrow('Tar symlink entry "docs/latest" would escape the output directory')
    await expect(access(linkPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  function createArchive(): Promise<void> {
    return create({ cwd: sourceDir, file: archivePath }, ['docs'])
  }
})
