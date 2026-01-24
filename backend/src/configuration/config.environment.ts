/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { join } from 'node:path'
import { AuthTokenAccessConfig, AuthTokenRefreshConfig } from '../authentication/auth.config'
import { ACCESS_KEY, CSRF_KEY, TWO_FA_VERIFY_EXPIRATION, WS_KEY } from '../authentication/constants/auth'
import { TOKEN_TYPE } from '../authentication/interfaces/token.interface'
import { transformAndValidate } from '../common/functions'
import { ServerConfig } from './config.interfaces'
import { configLoader } from './config.loader'
import { GlobalConfig } from './config.validation'

export const configuration: GlobalConfig = loadConfiguration()
export const serverConfig: ServerConfig = {
  twoFaEnabled: configuration.auth.mfa.totp.enabled,
  mailServerEnabled: !!configuration.mail?.host,
  fileEditors: {
    collabora: configuration.applications.files.collabora.enabled,
    onlyoffice: configuration.applications.files.onlyoffice.enabled
  }
}
export const exportConfiguration: (reload?: boolean) => GlobalConfig = (reload = false) => (reload ? loadConfiguration() : configuration)

function loadConfiguration(): GlobalConfig {
  const config: GlobalConfig = configLoader()
  // AUTHENTICATION
  // CSRF & WS & 2FA settings
  config.auth.token[TOKEN_TYPE.CSRF] = { ...config.auth.token[TOKEN_TYPE.REFRESH], name: CSRF_KEY } satisfies AuthTokenRefreshConfig
  config.auth.token[TOKEN_TYPE.WS] = { ...config.auth.token[TOKEN_TYPE.REFRESH], name: WS_KEY } satisfies AuthTokenRefreshConfig
  config.auth.token[TOKEN_TYPE.ACCESS_2FA] = {
    ...config.auth.token[TOKEN_TYPE.ACCESS],
    name: ACCESS_KEY,
    expiration: TWO_FA_VERIFY_EXPIRATION
  } satisfies AuthTokenAccessConfig
  config.auth.token[TOKEN_TYPE.CSRF_2FA] = {
    ...config.auth.token[TOKEN_TYPE.CSRF],
    expiration: TWO_FA_VERIFY_EXPIRATION
  } satisfies AuthTokenAccessConfig
  // APPLICATIONS CONFIGURATION
  // SPACES & FILES
  if (!config.applications.files.dataPath) {
    throw new Error('dataPath is not defined in environment.yaml')
  }
  config.applications.files.usersPath = join(config.applications.files.dataPath, 'users')
  config.applications.files.spacesPath = join(config.applications.files.dataPath, 'spaces')
  config.applications.files.tmpPath = join(config.applications.files.dataPath, 'tmp')
  // DEPRECATIONS
  // ldap.adminGroup → ldap.options.adminGroup
  if (typeof config.auth.ldap['adminGroup'] === 'string' && config.auth.ldap['adminGroup'].length > 0) {
    config.auth.ldap.options.adminGroup = config.auth.ldap['adminGroup']
    console.warn(
      '[DEPRECATED][CONFIGURATION] auth.ldap.adminGroup is deprecated and will be removed in a future version. ' +
        'Please use auth.ldap.options.adminGroup instead.'
    )
  }
  return transformAndValidate(GlobalConfig, config, { exposeDefaultValues: true }, { skipMissingProperties: false })
}
