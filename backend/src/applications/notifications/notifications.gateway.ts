import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server } from 'socket.io'
import { USER_ROOM_PREFIX } from '../users/constants/websocket'
import { NOTIFICATIONS_WS } from './constants/websocket'

@WebSocketGateway({ namespace: NOTIFICATIONS_WS.NAME_SPACE })
export class WebSocketNotifications {
  @WebSocketServer() server: Server

  sendMessageToUsers(userIds: number[], eventName: string, body: any) {
    if (userIds.length) {
      this.server.to(userIds.map((uid) => `${USER_ROOM_PREFIX}${uid}`)).emit(eventName, body)
    }
  }
}
