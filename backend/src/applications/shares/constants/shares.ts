import { SPACE_OPERATION, SPACE_PERMS_SEP } from '../../spaces/constants/spaces'

export enum SHARE_TYPE {
  COMMON = 0,
  LINK = 1
}

export const SHARE_ALL_OPERATIONS: string = Object.values(SPACE_OPERATION)
  .filter((p: string) => p !== SPACE_OPERATION.SHARE_INSIDE)
  .sort()
  .join(SPACE_PERMS_SEP)
