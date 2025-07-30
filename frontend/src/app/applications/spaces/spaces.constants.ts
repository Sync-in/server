/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faAnchor,
  faFileCircleMinus,
  faFileCirclePlus,
  faFileImport,
  faFilePen,
  faFolderClosed,
  faLayerGroup,
  faLink,
  faReply,
  faShare,
  faShareNodes,
  faTrashCan
} from '@fortawesome/free-solid-svg-icons'
import { SPACES_BASE_ROUTE } from '@sync-in-server/backend/src/applications/spaces/constants/routes'
import { SPACE_ALIAS, SPACE_OPERATION, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { AppMenu } from '../../layout/layout.interfaces'
import { LINKS_PATH } from '../links/links.constants'
import { RECENTS_ICON, RECENTS_PATH, RECENTS_TITLE } from '../recents/recents.constants'

export const SPACES_TITLE = {
  RECENTS: 'Recents',
  FILES: 'Files',
  PERSONAL_FILES: 'Personal files',
  SHORT_PERSONAL_FILES: 'Personal',
  TRASH: 'Trash',
  SPACES: 'Spaces',
  SHARES: 'Shares',
  SHARED: 'Shared',
  SHARED_WITH_ME: 'Shared with me',
  SHARED_WITH_OTHER: 'Shared with others',
  SHARED_WITH_ME_SHORT: 'With me',
  SHARED_WITH_OTHER_SHORT: 'With others',
  SHARED_BY_LINKS: 'Shared via links',
  SHARED_BY_LINKS_SHORT: 'Via links'
} as const

export const SPACES_ICON = {
  PERSONAL: faFolderClosed,
  SPACES: faLayerGroup,
  SHARES: faShareNodes,
  SHARED_WITH_ME: faReply,
  SHARED_WITH_OTHERS: faShare,
  ANCHORED: faAnchor,
  LINKS: faLink,
  TRASH: faTrashCan,
  EXTERNAL: faFileImport
} as const

export const SPACES_PATH = {
  SPACES: SPACES_BASE_ROUTE,
  FILES: SPACE_REPOSITORY.FILES,
  SHARES: SPACE_REPOSITORY.SHARES,
  SHARED: 'shared',
  LINKS: LINKS_PATH.LINKS,
  TRASHES: 'trashes',
  TRASH: SPACE_REPOSITORY.TRASH,
  PERSONAL: SPACE_ALIAS.PERSONAL,
  SPACES_FILES: `${SPACES_BASE_ROUTE}/${SPACE_REPOSITORY.FILES}`,
  SPACES_TRASH: `${SPACES_BASE_ROUTE}/${SPACE_REPOSITORY.TRASH}`,
  SPACES_SHARES: `${SPACES_BASE_ROUTE}/${SPACE_REPOSITORY.SHARES}`,
  PERSONAL_FILES: `${SPACES_BASE_ROUTE}/${SPACE_REPOSITORY.FILES}/${SPACE_ALIAS.PERSONAL}`,
  PERSONAL_TRASH: `${SPACES_BASE_ROUTE}/${SPACE_REPOSITORY.FILES}/${SPACE_ALIAS.PERSONAL}/${SPACE_REPOSITORY.TRASH}`
} as const

export const SPACES_PERMISSIONS_TEXT: Record<SPACE_OPERATION, { text: string; icon: IconDefinition }> = {
  a: { text: 'Add', icon: faFileCirclePlus },
  m: { text: 'Edit', icon: faFilePen },
  d: { text: 'Delete', icon: faFileCircleMinus },
  si: { text: 'Share inside', icon: SPACES_ICON.ANCHORED },
  so: { text: 'Share outside', icon: SPACES_ICON.SHARES }
} as const

export const SPACES_PERMISSIONS_MODEL: Record<SPACE_OPERATION, boolean> = {
  a: false,
  d: false,
  m: false,
  si: false,
  so: false
} as const

export const SPACES_MENU: AppMenu = {
  title: SPACES_TITLE.FILES,
  icon: faFolderClosed,
  link: SPACES_PATH.PERSONAL_FILES,
  matchLink: new RegExp(`^${SPACES_PATH.SPACES}|^${SPACES_PATH.TRASH}|^${SPACES_PATH.SHARES}|^${SPACES_PATH.SHARED}|^${SPACES_PATH.LINKS}`),
  level: 1,
  submenus: [
    {
      title: RECENTS_TITLE,
      icon: RECENTS_ICON,
      link: RECENTS_PATH.BASE
    },
    {
      id: USER_PERMISSION.PERSONAL_SPACE,
      title: SPACES_TITLE.SHORT_PERSONAL_FILES,
      icon: SPACES_ICON.PERSONAL,
      link: SPACES_PATH.PERSONAL_FILES,
      matchLink: new RegExp(`^${SPACES_PATH.PERSONAL_FILES}[/|?]`)
    },
    {
      id: USER_PERMISSION.SPACES,
      title: SPACES_TITLE.SPACES,
      icon: SPACES_ICON.SPACES,
      link: SPACES_PATH.SPACES,
      matchLink: new RegExp(`^${SPACES_PATH.SPACES}(\\?|$)|^${SPACES_PATH.SPACES}/${SPACES_PATH.FILES}/(?!${SPACES_PATH.PERSONAL}(/|\\?|$))`)
    },
    {
      id: USER_PERMISSION.SHARES,
      title: SPACES_TITLE.SHARED,
      icon: SPACES_ICON.SHARES,
      link: SPACES_PATH.SPACES_SHARES,
      matchLink: new RegExp(`^${SPACES_PATH.SPACES_SHARES}|^${SPACES_PATH.SHARED}|^${SPACES_PATH.LINKS}`),
      submenus: [
        {
          id: USER_PERMISSION.SHARES_ADMIN,
          title: SPACES_TITLE.SHARED_WITH_ME_SHORT,
          icon: SPACES_ICON.SHARED_WITH_ME,
          link: SPACES_PATH.SPACES_SHARES
        },
        {
          id: USER_PERMISSION.SHARES_ADMIN,
          title: SPACES_TITLE.SHARED_WITH_OTHER_SHORT,
          icon: SPACES_ICON.SHARED_WITH_OTHERS,
          link: SPACES_PATH.SHARED
        },
        { id: USER_PERMISSION.SHARES_ADMIN, title: SPACES_TITLE.SHARED_BY_LINKS_SHORT, icon: SPACES_ICON.LINKS, link: SPACES_PATH.LINKS }
      ]
    },
    {
      id: USER_PERMISSION.PERSONAL_SPACE,
      title: SPACES_TITLE.TRASH,
      icon: SPACES_ICON.TRASH,
      link: SPACES_PATH.TRASH,
      matchLink: new RegExp(`^${SPACES_PATH.SPACES}/${SPACES_PATH.TRASH}/`)
    }
  ]
} as const
