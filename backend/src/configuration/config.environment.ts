import { join } from 'node:path'
import { getDocumentTypes } from '../applications/files/constants/samples'
import { FilesContentIndexingConfig } from '../applications/files/files.config'
import { AuthTokenAccessConfig, AuthTokenRefreshConfig } from '../authentication/auth.config'
import { ACCESS_KEY, CSRF_KEY, TWO_FA_VERIFY_EXPIRATION, WS_KEY } from '../authentication/constants/auth'
import { TOKEN_TYPE } from '../authentication/interfaces/token.interface'
import { transformAndValidate } from '../common/functions'
import { ServerConfig } from './config.interfaces'
import { ENVIRONMENT_PREFIX } from './config.constants'
import { configLoader } from './config.loader'
import { GlobalConfig } from './config.validation'

export const configuration: GlobalConfig = loadConfiguration()
export const serverConfig: ServerConfig = {
  twoFaEnabled: configuration.auth.mfa.totp.enabled,
  mailServerEnabled: !!configuration.mail?.host,
  files: {
    editors: {
      collabora: configuration.applications.files.editors.collabora.enabled,
      eurooffice: configuration.applications.files.editors.eurooffice.enabled,
      onlyoffice: configuration.applications.files.editors.onlyoffice.enabled
    },
    sampleDocuments: getDocumentTypes(configuration.applications.files.sampleDocuments)
  }
}
export const exportConfiguration: (reload?: boolean) => GlobalConfig = (reload = false) => (reload ? loadConfiguration() : configuration)

function loadConfiguration(): GlobalConfig {
  deprecatedFilesEditorsEnvConfig()
  const config: GlobalConfig = configLoader()
  // LOGGER
  if (config.logger?.stdout === false) {
    config.logger.colorize = false
  }
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
  deprecatedFilesEditorsConfig(config)
  deprecatedFilesContentIndexingConfig(config)

  return transformAndValidate(
    GlobalConfig,
    config,
    { exposeDefaultValues: true },
    { skipMissingProperties: false },
    'Invalid configuration in environment.yaml'
  )
}

function deprecatedFilesEditorsEnvConfig(): void {
  for (const editor of ['ONLYOFFICE', 'COLLABORA']) {
    const deprecatedPrefix = `${ENVIRONMENT_PREFIX}APPLICATIONS_FILES_${editor}_`
    const currentPrefix = `${ENVIRONMENT_PREFIX}APPLICATIONS_FILES_EDITORS_${editor}_`

    for (const [deprecatedEnvKey, value] of Object.entries(process.env)) {
      if (!deprecatedEnvKey.startsWith(deprecatedPrefix) || value === undefined) {
        continue
      }

      const suffix = deprecatedEnvKey.slice(deprecatedPrefix.length)
      const currentEnvKey = `${currentPrefix}${suffix}`
      const alternateCurrentEnvKey = suffix.endsWith('_FILE') ? `${currentPrefix}${suffix.slice(0, -5)}` : `${currentEnvKey}_FILE`
      const configuredCurrentEnvKey = [currentEnvKey, alternateCurrentEnvKey].find((key) => process.env[key] !== undefined)

      if (configuredCurrentEnvKey) {
        console.warn(`Ignoring deprecated environment variable: "${deprecatedEnvKey}" because "${configuredCurrentEnvKey}" is set.`)
        continue
      }

      process.env[currentEnvKey] = value
      console.warn(`Environment variable "${deprecatedEnvKey}" is deprecated. Please use "${currentEnvKey}" instead.`)
    }
  }
}

function deprecatedFilesEditorsConfig(config: GlobalConfig): void {
  const files = config.applications.files as unknown as Record<string, any>
  const legacyEditors = ['onlyoffice', 'collabora'].filter((editor) => Object.prototype.hasOwnProperty.call(files, editor))

  if (legacyEditors.length === 0) {
    return
  }

  files.editors ??= {}
  for (const editor of legacyEditors) {
    const legacyConfig = files[editor]
    const currentConfig = files.editors[editor]
    files.editors[editor] =
      legacyConfig && currentConfig && typeof legacyConfig === 'object' && typeof currentConfig === 'object'
        ? { ...legacyConfig, ...currentConfig }
        : (currentConfig ?? legacyConfig)
    delete files[editor]
  }

  console.warn(
    '[DEPRECATED][CONFIGURATION] applications.files.onlyoffice and applications.files.collabora are deprecated and will be removed in a future version. ' +
      'Please use applications.files.editors.onlyoffice and applications.files.editors.collabora instead.'
  )
}

function deprecatedFilesContentIndexingConfig(config: GlobalConfig): void {
  // applications.files.contentIndexing → applications.files.contentIndexing.enabled
  if (typeof config.applications.files.contentIndexing !== 'boolean') {
    return
  }

  const filesContentIndexingConfig = new FilesContentIndexingConfig()
  filesContentIndexingConfig.enabled = config.applications.files.contentIndexing
  config.applications.files.contentIndexing = filesContentIndexingConfig
  console.warn(
    '[DEPRECATED][CONFIGURATION] applications.files.contentIndexing is deprecated and will be removed in a future version. ' +
      'Please use applications.files.contentIndexing.enabled instead.'
  )
}
