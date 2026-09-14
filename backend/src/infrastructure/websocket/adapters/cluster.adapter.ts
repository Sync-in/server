import { Injectable } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { createAdapter } from '@socket.io/cluster-adapter'
import { ServerOptions } from 'socket.io'

@Injectable()
export class ClusterAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options)
    const adapter: ReturnType<typeof createAdapter> = createAdapter()
    server.adapter(adapter)
    return server
  }
}
