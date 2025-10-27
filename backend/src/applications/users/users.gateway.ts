/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { BeforeApplicationShutdown, Logger } from '@nestjs/common'
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { Server } from 'socket.io'
import { JwtIdentityPayload } from '../../authentication/interfaces/jwt-payload.interface'
import { sleep } from '../../common/functions'
import { GetWsUser } from '../../infrastructure/websocket/decorators/web-socket-user.decorator'
import { AuthenticatedSocketIO } from '../../infrastructure/websocket/interfaces/auth-socket-io.interface'
import { getClientAddress } from '../../infrastructure/websocket/utils'
import { USER_ONLINE_STATUS } from './constants/user'
import { USER_ROOM_PREFIX, USERS_WS } from './constants/websocket'
import { EventChangeOnlineStatus, EventUpdateOnlineStatus, UserOnline } from './interfaces/websocket.interface'
import { UsersManager } from './services/users-manager.service'

@WebSocketGateway()
export class WebSocketUsers implements BeforeApplicationShutdown, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server
  private readonly internalEventOnlineUsers = 'listOnlineUsers'
  private readonly logger = new Logger(WebSocketUsers.name)
  private initialized = false
  private shuttingDown = false
  private readonly waitTime: number = 3000 //ms
  // to show local rooms : this.server.of('/').adapter.rooms

  constructor(private readonly usersManager: UsersManager) {}

  afterInit(server: Server): any {
    server.on(this.internalEventOnlineUsers, (cb) => cb(this.filterUserRooms(this.server.sockets.adapter.rooms.keys())))
    setTimeout(() => (this.initialized = true), this.waitTime)
  }

  beforeApplicationShutdown(_signal?: string) {
    this.shuttingDown = true
  }

  async handleConnection(socket: AuthenticatedSocketIO): Promise<void> {
    if (this.shuttingDown) return
    socket.join(`${USER_ROOM_PREFIX}${socket.user.id}`)
    this.sendOnlineUser(socket.user, parseInt((socket.handshake.query.onlineStatus as string) || '0')).catch((e: Error) =>
      this.logger.error(`${this.handleConnection.name} - ${e}`)
    )
    this.sendAllOnlineUsers(socket.user.id).catch((e: Error) => this.logger.error(`${this.handleConnection.name} - ${e}`))
    this.logger.log(
      `Connected: *${socket.user.login}* (${socket.user.id}) [${socket.id}] ${getClientAddress(socket)} ${socket.handshake.headers['user-agent']}`
    )
  }

  async handleDisconnect(socket: AuthenticatedSocketIO): Promise<void> {
    if (this.shuttingDown) return
    socket.leave(`${USER_ROOM_PREFIX}${socket.user.id}`)
    this.sendOfflineUser(socket.user.id).catch((e: Error) => this.logger.error(`${this.handleDisconnect.name} - ${e}`))
    this.logger.log(
      `Disconnected: *${socket.user.login}* (${socket.user.id}) [${socket.id}] ${getClientAddress(socket)} ${socket.handshake.headers['user-agent']}`
    )
  }

  @SubscribeMessage(USERS_WS.EVENTS.ONLINE_STATUS)
  setOnlineStatus(@GetWsUser() user: JwtIdentityPayload, @MessageBody() body: EventChangeOnlineStatus) {
    if (body.store) {
      // store in db
      this.usersManager.setOnlineStatus(user, body.status)
    }
    this.sendOnlineStatus(user.id, body.status).catch((e: Error) => this.logger.error(`${this.setOnlineStatus.name} - ${e}`))
  }

  private sendMessageToUsers(userIds: number[], eventName: string, body: any) {
    if (userIds.length) {
      this.server.to(userIds.map((uid) => `${USER_ROOM_PREFIX}${uid}`)).emit(eventName, body)
    }
  }

  private async sendOnlineUser(user: JwtIdentityPayload, status: USER_ONLINE_STATUS) {
    if (!this.initialized) {
      // all online users will be propagated in the next seconds
      return
    }
    if (status === USER_ONLINE_STATUS.OFFLINE) {
      // user's online status is offline, do not send update to others
      return
    }
    const userIdsToNotify: number[] = await this.getOnlineUserIdsWhitelist(user.id)
    if (userIdsToNotify.length) {
      const onlineUser: UserOnline = {
        id: user.id,
        login: user.login,
        email: user.email,
        fullName: user.fullName,
        onlineStatus: status
      } satisfies UserOnline
      this.sendMessageToUsers(userIdsToNotify, USERS_WS.EVENTS.ONLINE_USER, onlineUser)
    }
  }

  private async sendOfflineUser(userId: number): Promise<void> {
    // avoid sending offline event on quick reconnects
    await sleep(this.waitTime)
    // check if user room is empty before send event
    if ((await this.getOnlineUserIds()).indexOf(userId) === -1) {
      this.sendOnlineStatus(userId, USER_ONLINE_STATUS.OFFLINE).catch((e: Error) => this.logger.error(`${this.sendOfflineUser.name} - ${e}`))
    }
  }

  private async sendAllOnlineUsers(toUserId: number) {
    if (!this.initialized) {
      // wait for all reconnections before propagating all online users
      await sleep(this.waitTime)
    }
    const onlineUserIds: number[] = await this.getOnlineUserIdsWhitelist(toUserId)
    if (onlineUserIds.length) {
      const onlineUsers: UserOnline[] = await this.usersManager.getOnlineUsers(onlineUserIds)
      if (onlineUsers.length) {
        this.sendMessageToUsers([toUserId], USERS_WS.EVENTS.ONLINE_USERS, onlineUsers)
      }
    }
  }

  private async sendOnlineStatus(userId: number, status: USER_ONLINE_STATUS) {
    const userIdsToNotify: number[] = await this.getOnlineUserIdsWhitelist(userId, false)
    if (userIdsToNotify.length) {
      const onlineStatus: EventUpdateOnlineStatus = { userId: userId, status: status }
      this.sendMessageToUsers(userIdsToNotify, USERS_WS.EVENTS.ONLINE_STATUS, onlineStatus)
    }
  }

  private async getOnlineUserIdsWhitelist(userId: number, excludeUser = true): Promise<number[]> {
    /* get online users visible for the user */
    const currentOnlineUserIds: number[] = await this.getOnlineUserIds()
    if (currentOnlineUserIds.length) {
      let usersWhitelist: number[] = await this.usersManager.usersWhitelist(userId)
      if (usersWhitelist) {
        if (excludeUser) {
          usersWhitelist = usersWhitelist.filter((uid) => uid !== userId)
        }
        return usersWhitelist.filter((uid) => currentOnlineUserIds.indexOf(uid) > -1)
      }
    }
    return []
  }

  private async getOnlineUserIds(): Promise<number[]> {
    /* get all online users from all workers */
    const localUserIds: number[] = this.filterUserRooms(this.server.sockets.adapter.rooms.keys())
    const remoteUserIds: number[][] = await this.server.serverSideEmitWithAck(this.internalEventOnlineUsers)
    return [...new Set([...localUserIds, ...remoteUserIds].flat())]
  }

  private filterUserRooms(rooms: Iterable<string>): number[] {
    return [...rooms].filter((r) => r.startsWith(USER_ROOM_PREFIX)).map((ur) => parseInt(ur.split(USER_ROOM_PREFIX).pop()))
  }
}
