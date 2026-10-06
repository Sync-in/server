import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export const IS_TEST_ENV: boolean = process.env['NODE_ENV'] === 'test'
export const ENVIRONMENT_FILE_NAME = 'environment.yaml'
export const ENVIRONMENT_PATH = `environment/${ENVIRONMENT_FILE_NAME}`
export const ENVIRONMENT_DIST_FILE_NAME = 'environment.dist.yaml'
export const ENVIRONMENT_DIST_PATH = `environment/${ENVIRONMENT_DIST_FILE_NAME}`
export const STATIC_PATH = path.resolve(path.join(moduleDir, IS_TEST_ENV ? '../../../dist/static' : '../../static'))
export const STATIC_ASSETS_PATH = path.join(STATIC_PATH, 'assets')
export const DEFAULT_LOG_FILE_PATH = path.join(moduleDir, '../../logs/server.log')
export const ENVIRONMENT_PREFIX = 'SYNCIN_'
