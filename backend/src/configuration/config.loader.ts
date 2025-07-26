/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import * as yaml from 'js-yaml'
import fs from 'node:fs'
import path from 'node:path'
import { APP_LOGS_PATH, ENVIRONMENT_FILE_NAME, ENVIRONMENT_PATH } from './config.constants'
import { ENV_PREFIX } from './config.constants'

function configSysEnvLoader(config: any): any {
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(ENV_PREFIX)) continue

    const pathParts = key
      .slice(ENV_PREFIX.length) // remove prefix
      .toLowerCase()
      .split('_') // convert to path
    setNestedConfigValue(config, pathParts, value)
  }

  return config
}

function setNestedConfigValue(obj: any, pathParts: string[], value: any) {
  let current = obj
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i]
    if (!(part in current)) {
      // Optionally warn or silently skip
      return
    }
    current = current[part]
  }

  const finalKey = pathParts[pathParts.length - 1]

  // Try to parse types correctly
  current[finalKey] = parseEnvValue(value)
  
}

function parseEnvValue(value: string): any {
  if (value === 'true') return true
  if (value === 'false') return false
  if (!isNaN(Number(value))) return Number(value)
  return value
}

export function configLoader(): any {
  if (!fs.existsSync(APP_LOGS_PATH)) {
    fs.mkdirSync(APP_LOGS_PATH, { recursive: true })
  }
  for (const envPath of [path.join(__dirname, `../../../${ENVIRONMENT_PATH}`), `./${ENVIRONMENT_PATH}`, ENVIRONMENT_FILE_NAME]) {
    if (fs.existsSync(envPath) && fs.lstatSync(envPath).isFile()) {
      return configSysEnvLoader(yaml.load(fs.readFileSync(envPath, 'utf8')))
    }
  }
  throw new Error(`${ENVIRONMENT_FILE_NAME} not found`)
}

