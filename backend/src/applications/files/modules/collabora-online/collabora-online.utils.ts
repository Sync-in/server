/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { PATH_TO_SPACE_SEGMENTS } from '../../../spaces/utils/routes'
import type { FastifyCollaboraOnlineSpaceRequest } from './collabora-online.interface'

export function COLLABORA_ONLINE_TO_SPACE_SEGMENTS(req: FastifyCollaboraOnlineSpaceRequest): string[] {
  if (req.user.spaceUrl) {
    // `spaceUrl` and `dbFileHash` are set when the authentication token is provided via a query parameter by the Collabora Server
    if (req.user.dbFileHash === req.params.dbFileHash) {
      return req.user.spaceUrl.split('/')
    }
    throw new Error('Collabora Online - DB File Hash mismatch')
  } else {
    return PATH_TO_SPACE_SEGMENTS(req.params['*'])
  }
}
