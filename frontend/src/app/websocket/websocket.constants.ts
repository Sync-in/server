import type { SocketIoConfig } from 'ngx-socket-io'

export const webSocketOptions: SocketIoConfig = {
  url: '',
  options: { autoConnect: false, reconnection: true, forceNew: false, transports: ['websocket'] }
}
