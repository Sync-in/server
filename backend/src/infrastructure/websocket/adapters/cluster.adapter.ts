/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { createAdapter } from '@socket.io/cluster-adapter'
import { ServerOptions } from 'socket.io'

@Injectable()
export class ClusterAdapter extends IoAdapter {
  private readonly clusterAdapter = createAdapter()

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options)
    server.adapter(this.clusterAdapter)
    return server
  }
}
