import path from 'node:path'
import { convertImageToBase64 } from '../../../common/image'
import { STATIC_ASSETS_PATH } from '../../../configuration/config.constants'
import { isPathExists } from '../../files/utils/files'
import { UserModel } from '../models/user.model'
import { readFile, writeFile } from 'node:fs/promises'
import fs from 'fs/promises'

export const USER_DEFAULT_AVATAR_FILE_PATH = path.join(STATIC_ASSETS_PATH, 'avatar.svg')
export const USER_AVATAR_FILE_NAME = 'avatar.png'
export const USER_AVATAR_INFO = 'avatar.json' // used to determine if the avatar must be updated (oidc/ldap case)
export const USER_AVATAR_MAX_UPLOAD_SIZE = 1024 * 1024 * 5 // 5MB

export interface AvatarInfo {
  origin: string
  size: number
  lastModified?: string
}

export async function getAvatarBase64(userLogin: string): Promise<string> {
  const userAvatarPath = path.join(UserModel.getHomePath(userLogin), USER_AVATAR_FILE_NAME)
  return convertImageToBase64((await isPathExists(userAvatarPath)) ? userAvatarPath : USER_DEFAULT_AVATAR_FILE_PATH)
}

export async function saveAvatarMetadata(userLogin: string, origin: string, size?: number, lastModified?: string): Promise<void> {
  const userAvatarInfoPath = path.join(UserModel.getHomePath(userLogin), USER_AVATAR_INFO)
  try {
    if (size === undefined || lastModified === undefined) {
      const userAvatarPath = path.join(UserModel.getHomePath(userLogin), USER_AVATAR_FILE_NAME)
      const stats = await fs.stat(userAvatarPath)
      size ??= stats.size
      lastModified ??= stats.mtime.toUTCString()
    }
    await writeFile(userAvatarInfoPath, JSON.stringify({ origin, size, lastModified } satisfies AvatarInfo))
  } catch {
    // ignore
  }
}

export async function isAvatarMetadataUnchanged(userLogin: string, origin: string, size: number, lastModified: string): Promise<boolean> {
  const userAvatarInfoPath = path.join(UserModel.getHomePath(userLogin), USER_AVATAR_INFO)
  if (!(await isPathExists(userAvatarInfoPath))) return false
  let avatarInfo: AvatarInfo
  try {
    avatarInfo = JSON.parse(await readFile(userAvatarInfoPath, 'utf8'))
  } catch {
    return false
  }
  return avatarInfo?.origin === origin && avatarInfo?.size === size && avatarInfo?.lastModified === lastModified
}
