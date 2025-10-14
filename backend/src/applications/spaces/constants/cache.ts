/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

// cache quota key = `(quota-user|quota-space)-${id}` => number
export const CACHE_QUOTA_USER_PREFIX = 'quota-user'
export const CACHE_QUOTA_SPACE_PREFIX = 'quota-space'
export const CACHE_QUOTA_SHARE_PREFIX = 'quota-share'
export const CACHE_QUOTA_TTL = 86400 // 1 day
