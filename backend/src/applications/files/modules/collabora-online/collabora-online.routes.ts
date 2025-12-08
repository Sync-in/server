/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const COLLABORA_ONLINE_ROUTE = {
  BASE: '/wopi',
  FILES: 'files',
  CONTENTS: 'contents',
  SETTINGS: 'settings'
} as const

export const API_COLLABORA_ONLINE_SETTINGS = `${COLLABORA_ONLINE_ROUTE.BASE}/${COLLABORA_ONLINE_ROUTE.SETTINGS}`
export const API_COLLABORA_ONLINE_FILES = `${COLLABORA_ONLINE_ROUTE.BASE}/${COLLABORA_ONLINE_ROUTE.FILES}`
