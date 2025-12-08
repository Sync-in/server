/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { JwtIdentityPayload } from '../../../../authentication/interfaces/jwt-payload.interface'
import type { FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface'

export interface JwtCollaboraOnlinePayload extends JwtIdentityPayload {
  spaceUrl: string
  dbFileHash: string
}

export interface FastifyCollaboraOnlineSpaceRequest extends FastifySpaceRequest {
  user: FastifySpaceRequest['user'] & { spaceUrl?: string; dbFileHash?: string }
  params: FastifySpaceRequest['params'] & { dbFileHash?: string }
}

export interface CollaboraOnlineCheckFileInfo {
  BaseFileName: string
  OwnerId: string
  UserId: string
  UserFriendlyName: string
  Version: string
  Size: number
  LastModifiedTime: string
  ReadOnly: false
  UserExtraInfo: { avatar: string }
  UserCanNotWriteRelative: true
  UserCanWrite: boolean
  UserCanRename: false
  SupportsRename: false
  SupportsUpdate: true
  SupportsExport: boolean
  SupportsCoauth: true
  SupportsLocks: true
  SupportsGetLock: true
}
