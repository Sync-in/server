import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { ENVIRONMENT_PREFIX } from './config.constants'
import { configLoader } from './config.loader'

describe(configLoader.name, () => {
  const initialEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith(ENVIRONMENT_PREFIX)))
  const temporaryPaths: string[] = []

  beforeEach(() => {
    clearSyncInEnv()
  })

  afterEach(() => {
    clearSyncInEnv()
    Object.assign(process.env, initialEnv)
    for (const temporaryPath of temporaryPaths.splice(0)) {
      fs.rmSync(temporaryPath, { force: true, recursive: true })
    }
    vi.restoreAllMocks()
  })

  it.each([
    ['false', false],
    ['"false"', false],
    ["'false'", false],
    [`"'false'"`, "'false'"]
  ])('should parse %s as %s', (rawValue, expectedValue) => {
    const envKey = `${ENVIRONMENT_PREFIX}LOGGER_COLORIZE`
    process.env[envKey] = rawValue

    expect(configLoader().logger.colorize).toBe(expectedValue)
  })

  it('should apply nested overrides while preserving camelCase keys', () => {
    process.env[`${ENVIRONMENT_PREFIX}APPLICATIONS_FILES_EDITORS_ONLYOFFICE_EXTERNALSERVER`] = 'https://onlyoffice.example.com'

    expect(configLoader().applications.files.editors.onlyoffice.externalServer).toBe('https://onlyoffice.example.com')
  })

  it.each([`${ENVIRONMENT_PREFIX}UNKNOWN_PROPERTY`, `${ENVIRONMENT_PREFIX}LOGGER_UNKNOWN`])(
    'should ignore the unknown environment variable %s',
    (envKey) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      process.env[`${ENVIRONMENT_PREFIX}LOGGER_LEVEL`] = 'info'
      process.env[envKey] = 'value'

      const config = configLoader()

      expect(config.logger.level).toBe('info')
      expect(warnSpy).toHaveBeenCalledWith(`Ignoring unknown environment variable: "${envKey}".`)
    }
  )

  it('should load and trim a secret from a file', () => {
    const secretPath = createTemporaryFile('  secret-from-file\n')
    process.env[`${ENVIRONMENT_PREFIX}AUTH_TOKEN_ACCESS_SECRET_FILE`] = secretPath

    expect(configLoader().auth.token.access.secret).toBe('secret-from-file')
  })

  it('should preserve the base configuration when its secret file cannot be read', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const secretFileKey = `${ENVIRONMENT_PREFIX}AUTH_TOKEN_ACCESS_SECRET_FILE`
    const temporaryDirectory = createTemporaryDirectory()
    const missingSecretPath = path.join(temporaryDirectory, 'missing-secret')
    const baseSecret = configLoader().auth.token.access.secret
    process.env[secretFileKey] = missingSecretPath

    const config = configLoader()

    expect(config.auth.token.access.secret).toBe(baseSecret)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(`Unable to store secret from file ${missingSecretPath}`))
  })

  it('should merge an environment override without replacing sibling base configuration', () => {
    const baseSecret = configLoader().auth.token.access.secret
    process.env[`${ENVIRONMENT_PREFIX}AUTH_TOKEN_ACCESS_EXPIRATION`] = '10m'

    const accessToken = configLoader().auth.token.access

    expect(accessToken.expiration).toBe('10m')
    expect(accessToken.secret).toBe(baseSecret)
  })

  function clearSyncInEnv() {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith(ENVIRONMENT_PREFIX)) {
        delete process.env[key]
      }
    }
  }

  function createTemporaryFile(content: string): string {
    const temporaryDirectory = createTemporaryDirectory()
    const temporaryFile = path.join(temporaryDirectory, 'secret')
    fs.writeFileSync(temporaryFile, content)
    return temporaryFile
  }

  function createTemporaryDirectory(): string {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-in-config-loader-'))
    temporaryPaths.push(temporaryDirectory)
    return temporaryDirectory
  }
})
