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
  faShare,
  faShareNodes,
  faTrashCan
} from '@fortawesome/free-solid-svg-icons'
import { SPACES_BASE_ROUTE } from '@sync-in-server/backend/src/applications/spaces/constants/routes'
import {
  SPACE_ALIAS,
  SPACE_OPERATION,
  SPACE_PERSONAL_TITLE,
  SPACE_REPOSITORY
} from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { AppMenu, AppMenuSeparator } from '../../layout/layout.interfaces'
import { FAVORITES_ICON, FAVORITES_PATH, FAVORITES_TITLE } from '../favorites/favorites.constants'
import { LINKS_PATH } from '../links/links.constants'
import { RECENTS_ICON, RECENTS_PATH, RECENTS_TITLE } from '../recents/recents.constants'

export const SPACES_TITLE = {
  RECENTS: 'Recents',
  FILES: 'Files',
  PERSONAL_SPACE: SPACE_PERSONAL_TITLE,
  PERSONAL_SPACE_SHORT: 'Personal',
  COLLABORATIVE_SPACES: 'Collaborative spaces',
  COLLABORATIVE_SPACES_SHORT: 'Collaborative',
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
  SHARED_WITH_ME: faShareNodes,
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
  so: { text: 'Share outside', icon: SPACES_ICON.SHARED_WITH_OTHERS }
} as const

export const SPACES_PERMISSIONS_MODEL: Record<SPACE_OPERATION, boolean> = {
  a: false,
  d: false,
  m: false,
  si: false,
  so: false
} as const

const SPACES_MENU_SECTION = {
  SPACES: { separator: true, title: SPACES_TITLE.SPACES },
  SHARED: { separator: true, title: SPACES_TITLE.SHARED },
  BOTTOM_SEPARATOR: { separator: true, placement: 'bottom', wide: true }
} as const satisfies Record<string, AppMenuSeparator>

export const SPACES_MENU: AppMenu = {
  title: SPACES_TITLE.FILES,
  icon: faFolderClosed,
  link: SPACES_PATH.PERSONAL_FILES,
  matchLink: new RegExp(
    `^${RECENTS_PATH.BASE}|^${FAVORITES_PATH.BASE}|^${SPACES_PATH.SPACES}|^${SPACES_PATH.TRASH}|^${SPACES_PATH.SHARES}|^${SPACES_PATH.SHARED}|^${SPACES_PATH.LINKS}`
  ),
  submenus: [
    {
      title: RECENTS_TITLE,
      icon: RECENTS_ICON,
      link: RECENTS_PATH.BASE
    },
    SPACES_MENU_SECTION.SPACES,
    {
      id: USER_PERMISSION.PERSONAL_SPACE,
      title: SPACES_TITLE.PERSONAL_SPACE_SHORT,
      icon: SPACES_ICON.PERSONAL,
      link: SPACES_PATH.PERSONAL_FILES,
      matchLink: new RegExp(`^${SPACES_PATH.PERSONAL_FILES}[/|?]`),
      defaultLinkCandidate: true
    },
    {
      id: USER_PERMISSION.SPACES,
      title: SPACES_TITLE.COLLABORATIVE_SPACES_SHORT,
      icon: SPACES_ICON.SPACES,
      link: SPACES_PATH.SPACES,
      matchLink: new RegExp(`^${SPACES_PATH.SPACES}(\\?|$)|^${SPACES_PATH.SPACES}/${SPACES_PATH.FILES}/(?!${SPACES_PATH.PERSONAL}(/|\\?|$))`),
      defaultLinkCandidate: true
    },
    SPACES_MENU_SECTION.SHARED,
    {
      id: USER_PERMISSION.SHARES,
      title: SPACES_TITLE.SHARED_WITH_ME_SHORT,
      icon: SPACES_ICON.SHARED_WITH_ME,
      link: SPACES_PATH.SPACES_SHARES,
      matchLink: new RegExp(`^${SPACES_PATH.SPACES_SHARES}`),
      defaultLinkCandidate: true
    },
    {
      id: USER_PERMISSION.SHARES_ADMIN,
      title: SPACES_TITLE.SHARED_WITH_OTHER_SHORT,
      icon: SPACES_ICON.SHARED_WITH_OTHERS,
      link: SPACES_PATH.SHARED,
      matchLink: new RegExp(`^${SPACES_PATH.SHARED}`),
      defaultLinkCandidate: true
    },
    {
      id: USER_PERMISSION.SHARES_ADMIN,
      title: SPACES_TITLE.SHARED_BY_LINKS_SHORT,
      icon: SPACES_ICON.LINKS,
      link: SPACES_PATH.LINKS,
      matchLink: new RegExp(`^${SPACES_PATH.LINKS}`),
      defaultLinkCandidate: true
    },
    SPACES_MENU_SECTION.BOTTOM_SEPARATOR,
    {
      id: USER_PERMISSION.PERSONAL_SPACE,
      title: SPACES_TITLE.TRASH,
      icon: SPACES_ICON.TRASH,
      link: SPACES_PATH.TRASH,
      matchLink: new RegExp(`^${SPACES_PATH.SPACES}/${SPACES_PATH.TRASH}/`),
      placement: 'bottom'
    }
  ]
} as const
