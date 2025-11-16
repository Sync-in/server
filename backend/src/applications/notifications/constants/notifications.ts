/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ACTION } from '../../../common/constants'

export enum NOTIFICATION_APP {
  COMMENTS = 'comments',
  SPACES = 'spaces',
  SPACE_ROOTS = 'spaces_roots',
  SHARES = 'shares',
  LINKS = 'links',
  SYNC = 'sync',
  AUTH_LOCKED = 'auth_locked',
  AUTH_2FA = 'auth_2fa',
  UNLOCK_REQUEST = 'unlock_request'
}

export const NOTIFICATION_APP_EVENT = {
  COMMENTS: 'commented',
  SPACES: {
    [ACTION.ADD]: 'You now have access to the space',
    [ACTION.DELETE]: 'You no longer have access to the space',
    [ACTION.DELETE_PERMANENTLY]: 'This space has been permanently deleted'
  },
  SPACE_ROOTS: {
    [ACTION.ADD]: 'anchored',
    [ACTION.DELETE]: 'unanchored'
  },
  SHARES: {
    [ACTION.ADD]: 'shared with you',
    [ACTION.DELETE]: 'no longer share with you'
  },
  SHARES_WITHOUT_OWNER: {
    [ACTION.ADD]: 'You now have access to the share',
    [ACTION.DELETE]: 'You no longer have access to the share',
    [ACTION.DELETE_PERMANENTLY]: 'You are no longer a member of the parent share, your child share has been deleted'
  },
  LINKS: {
    [ACTION.ADD]: 'shared with you',
    [ACTION.UPDATE]: 'You now have access to the space'
  },
  SYNC: {
    [ACTION.DELETE]: 'You are no longer synchronizing'
  },
  AUTH_2FA: {
    [ACTION.ADD]: 'Two-factor authentication (2FA) on your account has been enabled',
    [ACTION.DELETE]: 'Two-factor authentication (2FA) on your account has been disabled'
  },
  AUTH_LOCKED: {
    [ACTION.DELETE]: 'Your account has been locked after several unsuccessful authentication attempts'
  },
  UNLOCK_REQUEST: 'sends you a request to unlock the file'
}
