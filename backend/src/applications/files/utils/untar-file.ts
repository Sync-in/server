import path from 'node:path'
import { extract, type ReadEntry } from 'tar'
import { isPathInside } from './files'

export function checkTarEntry(outputDir: string, entry: Pick<ReadEntry, 'type' | 'path' | 'linkpath'>): boolean {
  if (entry.type === 'Link') {
    throw new Error(`Tar entry "${entry.path}" is a hard link`)
  }
  if (entry.type !== 'SymbolicLink') return true
  if (!entry.linkpath) {
    throw new Error(`Tar symlink entry "${entry.path}" has no target`)
  }
  const linkPath = path.resolve(outputDir, entry.path)
  const targetPath = path.resolve(path.dirname(linkPath), entry.linkpath)
  if (!isPathInside(outputDir, linkPath) || !isPathInside(outputDir, targetPath, true)) {
    throw new Error(`Tar symlink entry "${entry.path}" would escape the output directory`)
  }
  return true
}

export async function extractTar(filePath: string, outputDir: string, gzip: boolean): Promise<void> {
  // Do not throw from the stream filter callback: reject explicitly once parsing has completed.
  let validationError: Error | undefined
  await extract({
    file: filePath,
    cwd: outputDir,
    gzip,
    preserveOwner: false,
    preservePaths: false,
    strict: true,
    filter: (_path, entry) => {
      if (validationError) return false
      try {
        return !('type' in entry) || checkTarEntry(outputDir, entry)
      } catch (e) {
        validationError = e as Error
        return false
      }
    }
  })
  if (validationError) throw validationError
}
