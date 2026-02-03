import {
  faArrowDown,
  faArrowUp,
  faCircleExclamation,
  faCopy,
  faFilter,
  faPencil,
  faPlus,
  faUpDownLeftRight,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

export enum SYNC_TRANSFER_SIDE {
  LOCAL = 'local',
  REMOTE = 'remote'
}

export const SYNC_TRANSFER_SIDE_CLASS = {
  [SYNC_TRANSFER_SIDE.LOCAL]: 'circle-purple-icon-sm',
  [SYNC_TRANSFER_SIDE.REMOTE]: 'circle-primary-icon-sm'
}

export const SYNC_TRANSFER_SIDE_ICON = {
  [SYNC_TRANSFER_SIDE.LOCAL]: faArrowDown,
  [SYNC_TRANSFER_SIDE.REMOTE]: faArrowUp
}

export const SYNC_TRANSFER_ACTION = {
  NEW: 'Added',
  DIFF: 'Modified',
  RM: 'Removed',
  RMDIR: 'Removed',
  MOVE: 'Moved',
  COPY: 'Copied',
  MKDIR: 'Added',
  MKFILE: 'Added',
  FILTERED: 'Filtered',
  ERROR: 'Error'
}

export const SYNC_TRANSFER_ACTION_ICON = {
  Added: faPlus,
  Modified: faPencil,
  Removed: faXmark,
  Moved: faUpDownLeftRight,
  Copied: faCopy,
  Filtered: faFilter,
  Error: faCircleExclamation
}
