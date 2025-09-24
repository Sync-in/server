/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import path from 'node:path'
import { convertImageToBase64 } from '../../../common/image'
import { STATIC_ASSETS_PATH } from '../../../configuration/config.constants'
import { isPathExists } from '../../files/utils/files'
import { UserModel } from '../models/user.model'

export const USER_DEFAULT_AVATAR_FILE_PATH = path.join(STATIC_ASSETS_PATH, 'avatar.svg')
export const USER_AVATAR_FILE_NAME = 'avatar.png'
export const USER_AVATAR_MAX_UPLOAD_SIZE = 1024 * 1024 * 5 // 5MB

export async function getAvatarBase64(userLogin: string): Promise<string> {
  const userAvatarPath = path.join(UserModel.getHomePath(userLogin), USER_AVATAR_FILE_NAME)
  return convertImageToBase64((await isPathExists(userAvatarPath)) ? userAvatarPath : USER_DEFAULT_AVATAR_FILE_PATH)
}
