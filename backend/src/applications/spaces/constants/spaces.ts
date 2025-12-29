/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const SPACE_MAX_DISABLED_DAYS = 30 //days

export const SPACE_PERMS_SEP = ':'

export enum SPACE_OPERATION {
  ADD = 'a',
  MODIFY = 'm',
  DELETE = 'd', // MOVE is not allowed if no DELETE permission
  SHARE_INSIDE = 'si', // Inside a space (add a space root)
  SHARE_OUTSIDE = 'so' // Outside a space (create a share)
}

export enum SPACE_REPOSITORY {
  FILES = 'files',
  TRASH = 'trash',
  SHARES = 'shares'
}

export enum SPACE_ALIAS {
  PERSONAL = 'personal',
  SPACES = 'spaces',
  SHARES = SPACE_REPOSITORY.SHARES,
  TRASH = SPACE_REPOSITORY.TRASH
}

export enum SPACE_ROLE {
  IS_MEMBER,
  IS_MANAGER
}

export const SPACE_ALL_OPERATIONS: string = Object.values(SPACE_OPERATION).sort().join(SPACE_PERMS_SEP)

export const SPACE_HTTP_PERMISSION: Record<string, SPACE_OPERATION> = {
  GET: null,
  POST: SPACE_OPERATION.ADD,
  PUT: SPACE_OPERATION.ADD,
  MKCOL: SPACE_OPERATION.ADD,
  PATCH: SPACE_OPERATION.MODIFY,
  PROPPATCH: SPACE_OPERATION.MODIFY,
  DELETE: SPACE_OPERATION.DELETE,
  MOVE: SPACE_OPERATION.DELETE, // `DELETE` permission must be checked on the source, `ADD` permission must be checked on the destination
  COPY: null, // `ADD` permission must be checked on destination
  LOCK: SPACE_OPERATION.MODIFY,
  UNLOCK: SPACE_OPERATION.MODIFY
} as const

export const SPACE_PERSONAL = {
  id: 0,
  alias: SPACE_ALIAS.PERSONAL,
  name: SPACE_ALIAS.PERSONAL,
  permissions: '' // by default, no rights are given on the space unless a resource is targeted
} as const

export const SPACE_SHARES = {
  // this space lists the shares
  id: 0,
  alias: SPACE_REPOSITORY.SHARES,
  name: SPACE_REPOSITORY.SHARES,
  permissions: '' // by default, no rights are given on the share unless a resource is targeted
} as const
