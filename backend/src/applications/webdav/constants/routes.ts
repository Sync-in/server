/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { SERVER_NAME } from '../../../common/shared'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '../../spaces/constants/spaces'

export const WEBDAV_BASE_PATH = 'webdav'

export const WEBDAV_NS = {
  SERVER: SERVER_NAME,
  WEBDAV: WEBDAV_BASE_PATH,
  PERSONAL: SPACE_ALIAS.PERSONAL,
  SPACES: SPACE_ALIAS.SPACES,
  SHARES: SPACE_ALIAS.SHARES,
  TRASH: SPACE_ALIAS.TRASH
} as const

export const WEBDAV_SPACES: Record<(typeof WEBDAV_NS)[keyof typeof WEBDAV_NS], { route: string; spaceRepository: string[] }> = {
  [WEBDAV_NS.SERVER]: { route: '/', spaceRepository: null },
  [WEBDAV_NS.WEBDAV]: { route: `/${WEBDAV_BASE_PATH}`, spaceRepository: null },
  [WEBDAV_NS.PERSONAL]: { route: `/${WEBDAV_BASE_PATH}/${WEBDAV_NS.PERSONAL}`, spaceRepository: [SPACE_REPOSITORY.FILES, SPACE_ALIAS.PERSONAL] },
  [WEBDAV_NS.SPACES]: { route: `/${WEBDAV_BASE_PATH}/${WEBDAV_NS.SPACES}`, spaceRepository: [SPACE_REPOSITORY.FILES] },
  [WEBDAV_NS.SHARES]: { route: `/${WEBDAV_BASE_PATH}/${WEBDAV_NS.SHARES}`, spaceRepository: [SPACE_REPOSITORY.SHARES] },
  [WEBDAV_NS.TRASH]: {
    route: `/${WEBDAV_BASE_PATH}/${WEBDAV_NS.TRASH}`,
    spaceRepository: [SPACE_REPOSITORY.TRASH]
  }
}
