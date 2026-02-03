import { SPACE_ALIAS, SPACE_REPOSITORY } from '../../spaces/constants/spaces'

export const SYNC_IN_SERVER_AGENT = 'sync-in' as const
export const CHECK_SERVER_RESP = { server: SYNC_IN_SERVER_AGENT } as const
export const SYNC_CHECKSUM_ALG = 'sha512-256'
export const SYNC_DIFF_DONE = 'done'
export const SYNC_FILE_NAME_PREFIX = '.sync-in.'

export enum SYNC_REPOSITORY {
  PERSONAL = SPACE_ALIAS.PERSONAL,
  SPACES = SPACE_ALIAS.SPACES,
  SHARES = SPACE_ALIAS.SHARES
}

export const SYNC_PATH_REPOSITORY = {
  [SYNC_REPOSITORY.PERSONAL]: [SPACE_REPOSITORY.FILES, SYNC_REPOSITORY.PERSONAL],
  [SYNC_REPOSITORY.SPACES]: [SPACE_REPOSITORY.FILES],
  [SYNC_REPOSITORY.SHARES]: [SPACE_REPOSITORY.SHARES]
} as const

export enum SYNC_CLIENT_TYPE {
  DESKTOP = 'sync-in-desktop',
  CLI = 'sync-in-cli'
}

export enum SYNC_PATH_MODE {
  DOWNLOAD = 'download',
  UPLOAD = 'upload',
  BOTH = 'both'
}

export enum SYNC_PATH_DIFF_MODE {
  FAST = 'fast',
  SECURE = 'secure'
}

export enum SYNC_PATH_CONFLICT_MODE {
  RECENT = 'recent',
  LOCAL = 'local',
  REMOTE = 'remote'
}

export enum SYNC_PATH_SCHEDULER_UNIT {
  DISABLED = 'disabled',
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day'
}

export enum F_STAT {
  IS_DIR = 0,
  SIZE = 1,
  MTIME = 2,
  INO = 3,
  CHECKSUM = 4
}

export enum F_SPECIAL_STAT {
  FILTERED = 'filtered',
  ERROR = 'error'
}
