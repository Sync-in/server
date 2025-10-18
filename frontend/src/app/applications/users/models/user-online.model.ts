/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { USER_ONLINE_STATUS } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { UserOnline } from '@sync-in-server/backend/src/applications/users/interfaces/websocket.interface'
import { popFromObject } from '@sync-in-server/backend/src/common/shared'
import { USER_ONLINE_STATUS_LIST } from '../user.constants'
import { userAvatarUrl } from '../user.functions'

export class UserOnlineModel implements UserOnline {
  id: number
  login: string
  email: string
  fullName: string
  onlineStatus: USER_ONLINE_STATUS

  // extra properties
  avatarUrl: string
  onlineTextStatus: string

  constructor(props: UserOnline) {
    this.setOnlineStatus(popFromObject('status', props))
    this.avatarUrl = userAvatarUrl(props.login)
    Object.assign(this, props)
  }

  setOnlineStatus(status: USER_ONLINE_STATUS) {
    this.onlineStatus = status
    this.onlineTextStatus = USER_ONLINE_STATUS_LIST[status]
  }
}
