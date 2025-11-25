/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'node:path'
import { IS_TEST_ENV } from './configuration/config.constants'

export function loadVersion(): string {
  let version: string | undefined
  const currentDir = resolve(join(__dirname, IS_TEST_ENV ? '../../' : '.'))
  const packageJson = 'package.json'
  const candidatePaths = [join(currentDir, `./${packageJson}`), join(currentDir, `../${packageJson}`), join(currentDir, `../../${packageJson}`)]

  for (const p of candidatePaths) {
    if (!existsSync(p)) continue
    try {
      version = JSON.parse(readFileSync(p, 'utf8')).version
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
