/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export enum CLIENT_AUTH_TYPE {
  COOKIE = 'cookie',
  TOKEN = 'token'
}

export const CLIENT_TOKEN_EXPIRATION_TIME = '120d'
export const CLIENT_TOKEN_RENEW_TIME = '60d'
export const CLIENT_TOKEN_EXPIRED_ERROR = 'Client token is expired'
