export enum FILE_OPERATION {
  MAKE = 'make',
  COPY = 'copy',
  MOVE = 'move',
  DELETE = 'delete',
  COMPRESS = 'compress',
  DECOMPRESS = 'decompress',
  DOWNLOAD = 'download',
  UPLOAD = 'upload',
  TOUCH = 'touch',
  THUMBNAIL = 'thumbnail',
  GET_SIZE = 'getSize',
  LOCK = 'lock',
  UNLOCK = 'unlock',
  UNLOCK_REQUEST = 'unlockRequest'
}

export enum FILE_MODE {
  VIEW = 'view',
  EDIT = 'edit'
}

export enum FILE_REPOSITORY {
  USER = 'user',
  SPACE = 'space',
  SHARE = 'share'
}

export const FORCE_AS_FILE_OWNER = 'forceAsFileOwner' as const

export const SEND_FILE_ERROR_MSG = {
  400: 'The location is a directory',
  404: 'Location not found',
  405: 'The location is not readable'
} as const
