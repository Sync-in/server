import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IS_TEST_ENV } from './configuration/config.constants.js'

export function loadVersion(): string {
  let version: string | undefined
  const currentDir = resolve(join(dirname(fileURLToPath(import.meta.url)), IS_TEST_ENV ? '../../' : '.'))
  const packageJson = 'package.json'
  const candidatePaths = [join(currentDir, `./${packageJson}`), join(currentDir, `../${packageJson}`), join(currentDir, `../../${packageJson}`)]

  for (const p of candidatePaths) {
    if (!existsSync(p)) continue
    try {
      const candidateVersion = JSON.parse(readFileSync(p, 'utf8')).version
      if (typeof candidateVersion !== 'string' || !candidateVersion) continue
      version = candidateVersion
      break
    } catch (e) {
      console.error(`unable to load version from: ${p} - ${e}`)
    }
  }

  if (!version) {
    throw new Error('Application version not found (package.json not readable on known paths)')
  }

  return version
}
