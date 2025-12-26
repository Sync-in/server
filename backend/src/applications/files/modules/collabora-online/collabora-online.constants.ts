/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const COLLABORA_URI = 'browser/dist/cool.html'
export const COLLABORA_CONTEXT = 'CollaboraOnlineEnvironment' as const
export const COLLABORA_WOPI_SRC_QUERY_PARAM_NAME = 'WOPISrc' as const
export const COLLABORA_TOKEN_QUERY_PARAM_NAME = 'access_token' as const
export const COLLABORA_OWNER_LOCK = 'Collabora Online' as const

export const COLLABORA_HEADERS = {
  Action: 'x-wopi-override',
  LockToken: 'x-wopi-lock',
  Timestamp: 'x-cool-wopi-timestamp'
} as const

export enum COLLABORA_LOCK_ACTION {
  LOCK = 'LOCK',
  UNLOCK = 'UNLOCK',
  GET_LOCK = 'GET_LOCK',
  REFRESH_LOCK = 'REFRESH_LOCK'
}

export const COLLABORA_ONLINE_EXTENSIONS = new Set<string>([
  // ─────────────
  // WORD (Writer)
  // ─────────────
  'doc',
  'docx',
  'docm',
  'dot',
  'dotx',
  'dotm',
  'odt',
  'ott',
  'rtf',
  'fodt',

  // StarOffice / legacy
  'sxw',
  'stw',

  // ─────────────
  // CELL (Calc)
  // ─────────────
  'xls',
  'xlsx',
  'xlsm',
  'xlt',
  'xltx',
  'ods',
  'ots',
  'csv',
  'fods',

  // StarOffice
  'sxc',
  'sdc',

  // ─────────────
  // SLIDE (Impress)
  // ─────────────
  'ppt',
  'pptx',
  'pptm',
  'pps',
  'ppsx',
  'odp',
  'otp',
  'fodp',

  // StarOffice
  'sxi',
  'sdd',

  // ─────────────
  // DRAW / DIAGRAM
  // ─────────────
  'odg'
])
