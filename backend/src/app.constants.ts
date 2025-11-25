/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { loadVersion } from './app.functions'

export const VERSION = loadVersion()
export const USER_AGENT = `sync-in-server/${VERSION}`
export const CONTENT_SECURITY_POLICY = (onlyOfficeServer: string) => ({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'", onlyOfficeServer || ''],
    scriptSrc: ["'self'", "'unsafe-inline'", onlyOfficeServer || ''],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"]
  }
})

export const CONNECT_ERROR_CODE = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'])
