/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const assetsUrl = 'assets'
export const mimeExtension = '.svg'
export const assetsMimeUrl = `${assetsUrl}/mimes`
export const mimeFile = 'file'
export const mimeDirectory = 'directory'
export const mimeDirectoryShare = 'directory_share'
export const mimeDirectorySync = 'directory_sync'
export const mimeDirectoryDisabled = 'directory_disabled'
export const mimeDirectoryError = 'directory_error'

export function getAssetsMimeUrl(asset: string): string {
  return `${assetsMimeUrl}/${asset}${mimeExtension}`
}

export const logoIconUrl = `${assetsUrl}/favicon${mimeExtension}`
export const logoDarkUrl = `${assetsUrl}/logo-dark${mimeExtension}`
export const logoUrl = `${assetsUrl}/logo${mimeExtension}`
export const linkProtected = `${assetsUrl}/protected.png`
export const defaultMimeUrl = getAssetsMimeUrl(mimeFile)
export const compressibleMimes = new Set(['application-gzip', 'application-zip', 'application-x-tar'])
export const notViewableExtensions = new Set([
  'rar',
  '7z',
  'iso',
  'zip',
  'tar',
  'gz',
  'bz2',
  'xz',
  'exe',
  'dll',
  'msi',
  'cmd',
  'apk',
  'appimage',
  'dmg',
  'img',
  'bin',
  'vhd',
  'vmdk',
  'so',
  'o',
  'a',
  'lib',
  'sys',
  'drv',
  'cab'
])
