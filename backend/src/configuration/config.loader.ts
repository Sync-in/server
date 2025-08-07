/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import deepmerge from 'deepmerge'
import * as yaml from 'js-yaml'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_LOG_FILE_PATH,
  ENVIRONMENT_DIST_FILE_NAME,
  ENVIRONMENT_DIST_PATH,
  ENVIRONMENT_FILE_NAME,
  ENVIRONMENT_PATH,
  ENVIRONMENT_PREFIX
} from './config.constants'
import type { Configuration } from './config.validation'

export function configLoader(): any {
  let config: Partial<Configuration> = loadEnvFile(ENVIRONMENT_PATH, ENVIRONMENT_FILE_NAME)

  if (hasEnvConfig()) {
    // If any environment vars are found, parse the config model and apply those settings
    const envConfig = getEnvOverrides(loadEnvFile(ENVIRONMENT_DIST_PATH, ENVIRONMENT_DIST_FILE_NAME, true))
    config = deepmerge(config, envConfig)
  }

  if (Object.keys(config).length === 0) {
    throw new Error(`Missing configuration: "${ENVIRONMENT_FILE_NAME}" not found, or no variables beginning with "${ENVIRONMENT_PREFIX}" are set.`)
  }

  if (config.logger.stdout === false) {
    // ensure log directory exists
    const logFilePath = config.logger.filePath || DEFAULT_LOG_FILE_PATH
    const dirLogPath = path.dirname(logFilePath)
    if (!fs.existsSync(dirLogPath)) {
      fs.mkdirSync(dirLogPath, { recursive: true })
    }
    console.log(`Logging to file → ${logFilePath}`)
  }

  return config
}

function buildPathsUp(basePath: string, fileName: string, levels = 4): string[] {
  // Generates candidate file paths, optionally walking up from __dirname to a given depth.
  return Array.from({ length: levels + 1 }, (_, i) => path.resolve(basePath, ...Array(i).fill('..'), fileName))
}

function loadEnvFile(envPath: string, envFileName: string, throwIfMissing = false): any {
  const candidates = [envPath, envFileName, ...buildPathsUp(__dirname, envPath), ...buildPathsUp(__dirname, envFileName)]
  for (const envFilePath of candidates) {
    if (fs.existsSync(envFilePath) && fs.lstatSync(envFilePath).isFile()) {
      if (envFileName === ENVIRONMENT_FILE_NAME) {
        console.log(`Load configuration → ${envFilePath}`)
      }
      return yaml.load(fs.readFileSync(envFilePath, 'utf8'))
    }
  }
  if (throwIfMissing) {
    throw new Error(`${envFileName} not found`)
  }
  return {}
}

function hasEnvConfig(): boolean {
  return Object.keys(process.env).some((key) => key.startsWith(ENVIRONMENT_PREFIX))
}

/**
 * Parse a raw env-string into boolean, number or leave as string.
 */
function parseEnvValue(value: string): any {
  // remove quotes & convert to lowercase
  value = value.replace(/^"+|"+$/g, '').toLowerCase()
  if (value === 'true') return true
  if (value === 'false') return false
  if (!isNaN(Number(value))) return Number(value)
  return value
}

/**
 * Assigns a nested property into obj, creating sub-objects as needed.
 */
function setObjectPropertyFromString(obj: any, property: string, value: any): void {
  const segments = property.split('.')
  let cursor = obj
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    if (!(seg in cursor) || typeof cursor[seg] !== 'object') {
      cursor[seg] = {}
    }
    cursor = cursor[seg]
  }
  cursor[segments[segments.length - 1]] = value
}

/**
 * Returns a new object containing only the env-var overrides
 * that match existing keys in `config`, nested and cased properly.
 */
function getEnvOverrides(config: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}

  for (const [envKey, rawValue] of Object.entries(process.env)) {
    if (!envKey.startsWith(ENVIRONMENT_PREFIX) || rawValue === undefined) {
      continue
    }

    // ["APPLICATIONS","FILES","DATAPATH"] etc.
    const segments = envKey.slice(ENVIRONMENT_PREFIX.length).split('_')
    const secretFromFile = segments[segments.length - 1] === 'FILE'
    if (secretFromFile) {
      // remove FILE attribute
      segments.pop()
    }

    // Walk through config to validate path & capture real key names
    let cursorConfig: any = config
    const realSegments: string[] = []
    let pathExists = true

    for (const seg of segments) {
      if (cursorConfig == null || typeof cursorConfig !== 'object') {
        pathExists = false
        break
      }
      // Find the actual key (preserving camelCase) whose uppercase matches seg
      const match = Object.keys(cursorConfig).find((k) => k.toUpperCase() === seg)
      if (!match) {
        pathExists = false
        break
      }
      realSegments.push(match)
      cursorConfig = cursorConfig[match]
    }

    if (!pathExists) {
      console.warn(`Ignoring unknown environment variable: "${envKey}".`)
      continue
    }

    // Build the nested override in `result`
    const path = realSegments.join('.')
    if (secretFromFile) {
      try {
        setObjectPropertyFromString(result, path, fs.readFileSync(rawValue, 'utf-8').trim())
      } catch (e) {
        console.error(`Unable to store secret from file ${rawValue} : ${e}`)
      }
    } else {
      setObjectPropertyFromString(result, path, parseEnvValue(rawValue))
    }
  }

  return result
}
