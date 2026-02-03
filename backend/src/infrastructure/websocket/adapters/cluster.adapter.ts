import { Injectable } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { createAdapter } from '@socket.io/cluster-adapter'
import { ServerOptions } from 'socket.io'

@Injectable()
export class ClusterAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options)
    // Prevent the connection from closing too early when NestJS shutdown hooks are enabled, which can cause errors on exit
    server.close = () => void 0
    const adapter: ReturnType<typeof createAdapter> = createAdapter()
    server.adapter(adapter)
    return server
  }
}
