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

export const FORCE_AS_FILE_OWNER = 'forceAsFileOwner' as const
