/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Socket } from 'socket.io'
import { configuration } from '../../configuration/config.environment'

export function getClientAddress(socket: Socket) {
  return (
    (configuration.server.trustProxy ? socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0] : undefined) || // via proxy
    socket.handshake.address || // fallback
    socket.conn.remoteAddress // fallback (IPv6)
  )
}
