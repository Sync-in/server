/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const EVENT = {
  // server
  SERVER: {
    REGISTRATION: 'server-registration',
    AUTHENTICATION: 'server-authentication',
    AUTHENTICATION_FAILED: 'server-authentication-failed',
    AUTHENTICATION_TOKEN_UPDATE: 'server-authentication-token-update',
    AUTHENTICATION_TOKEN_EXPIRED: 'server-authentication-token-expired',
    SET_ACTIVE_AND_SHOW: 'server-set-active-and-show'
  },
  // oidc authentication
  OIDC: {
    START_LOOPBACK: 'oidc-start-loopback',
    WAIT_CALLBACK: 'oidc-wait-callback'
  },
  // sync
  SYNC: {
    PATH_OPERATION: 'sync-path-operation',
    TASKS_COUNT: 'sync-tasks-count',
    STATUS: 'core-sync-status',
    ERRORS: 'sync-errors',
    TRANSFER: 'sync-transfer',
    REPORT_TRANSFER: 'sync-report-transfer',
    TRANSFER_LOGS: 'sync-transfer-logs',
    SCHEDULER_STATE: 'sync-scheduler-state'
  },
  // tasks & notifications & chats
  APPLICATIONS: {
    MSG: 'applications-msg',
    COUNTER: 'applications-counter'
  },
  MISC: {
    DIALOG_OPEN: 'dialog-open',
    URL_OPEN: 'url-open',
    FILE_OPEN: 'file-open',
    SWITCH_THEME: 'switch-theme',
    NETWORK_IS_ONLINE: 'network-is-online'
  }
}
