/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faLockOpen } from '@fortawesome/free-solid-svg-icons'
import { NOTIFICATION_APP } from '@sync-in-server/backend/src/applications/notifications/constants/notifications'
import { COMMENTS_ICON } from '../comments/comments.constants'
import { SPACES_ICON } from '../spaces/spaces.constants'
import { SYNC_ICON } from '../sync/sync.constants'

export const NOTIFICATION_ICON: Partial<Record<NOTIFICATION_APP, IconDefinition>> = {
  [NOTIFICATION_APP.COMMENTS]: COMMENTS_ICON,
  [NOTIFICATION_APP.SPACES]: SPACES_ICON.SPACES,
  [NOTIFICATION_APP.SPACE_ROOTS]: SPACES_ICON.SPACES,
  [NOTIFICATION_APP.SHARES]: SPACES_ICON.SHARES,
  [NOTIFICATION_APP.LINKS]: SPACES_ICON.LINKS,
  [NOTIFICATION_APP.SYNC]: SYNC_ICON.SYNC,
  [NOTIFICATION_APP.UNLOCK_REQUEST]: faLockOpen
}
