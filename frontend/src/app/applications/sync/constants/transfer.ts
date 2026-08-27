import {
  LucideArrowDown,
  LucideArrowUp,
  LucideCircleAlert,
  LucideCopy,
  LucideFunnel,
  LucideMove,
  LucidePencil,
  LucidePlus,
  LucideX
} from '@lucide/angular'

export enum SYNC_TRANSFER_SIDE {
  LOCAL = 'local',
  REMOTE = 'remote'
}

export const SYNC_TRANSFER_SIDE_CLASS = {
  [SYNC_TRANSFER_SIDE.LOCAL]: 'circle-purple-icon-sm',
  [SYNC_TRANSFER_SIDE.REMOTE]: 'circle-primary-icon-sm'
}

export const SYNC_TRANSFER_SIDE_ICON = {
  [SYNC_TRANSFER_SIDE.LOCAL]: LucideArrowDown,
  [SYNC_TRANSFER_SIDE.REMOTE]: LucideArrowUp
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
  Added: LucidePlus,
  Modified: LucidePencil,
  Removed: LucideX,
  Moved: LucideMove,
  Copied: LucideCopy,
  Filtered: LucideFunnel,
  Error: LucideCircleAlert
}
