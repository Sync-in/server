/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { join } from 'node:path'
import { CSRF_KEY, WS_KEY } from '../authentication/constants/auth'
import { transformAndValidate } from '../common/functions'
import { configLoader } from './config.loader'
import { Configuration } from './config.validation'

export const configuration: Configuration = loadConfiguration()
export const exportConfiguration: (reload?: boolean) => Configuration = (reload = false) => (reload ? loadConfiguration() : configuration)

function loadConfiguration(): Configuration {
  const config: Configuration = configLoader()
  // AUTHENTICATION
  // CSRF & WS settings
  config.auth.token.csrf = { ...config.auth.token.refresh, name: CSRF_KEY }
  config.auth.token.ws = { ...config.auth.token.refresh, name: WS_KEY }
  // APPLICATIONS CONFIGURATION
  // SPACES & FILES
  if (!config.applications.files.dataPath) {
    throw new Error('dataPath is not defined in environment.yaml')
  }
  config.applications.files.usersPath = join(config.applications.files.dataPath, 'users')
  config.applications.files.spacesPath = join(config.applications.files.dataPath, 'spaces')
  config.applications.files.tmpPath = join(config.applications.files.dataPath, 'tmp')
  return transformAndValidate(Configuration, config, { exposeDefaultValues: true }, { skipMissingProperties: false })
}
