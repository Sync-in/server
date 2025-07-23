/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import path from 'node:path'
import process from 'node:process'

export const IS_DEV_ENV: boolean = process.env['NODE_ENV'] === 'development'
export const IS_TEST_ENV: boolean = process.env['NODE_ENV'] === 'test'
export const ENVIRONMENT_FILE_NAME = 'environment.yaml'
export const ENVIRONMENT_PATH = `environment/${ENVIRONMENT_FILE_NAME}`
export const STATIC_PATH = path.resolve(path.join(__dirname, IS_TEST_ENV ? '../../../dist/static' : '../../static'))
export const STATIC_ASSETS_PATH = path.join(STATIC_PATH, 'assets')
export const APP_LOGS_PATH = path.join(__dirname, '../../logs')
export const ENV_PREFIX = 'SYNCIN_'
