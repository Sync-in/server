/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { SPACE_PERMS_SEP } from '../applications/spaces/constants/spaces'

export const SERVER_NAME = 'Sync-in' as const

// eslint-disable-next-line no-control-regex
export const regExpInvalidFileName = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$|[<>:"/\\|?*\x00-\x1f\x80-\x9f]/
export const regExpPreventPathTraversal = /^(\.\.(\/|\\|$))+/
export const regExpNumberSuffix = /-\d+$/
export const forbiddenChars = '\\ / : * ? " < > |'

export function isValidFileName(fileName: string) {
  if (regExpInvalidFileName.test(fileName)) {
    throw new Error('Forbidden characters')
  }
}

export function currentTimeStamp(date?: Date, ms = false): number {
  return Math.floor((date ? date : new Date()).getTime() / (ms ? 1 : 1000))
}

export function currentDate(value?: string): Date {
  return new Date((value ? value : new Date().toISOString()).split('T')[0])
}

export function createSlug(input: string, replaceCount = false): string {
  const r = input
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (replaceCount) return r.replace(regExpNumberSuffix, '')
  return r
}

export function createLightSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function genPassword(length = 12) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz!@#$%^&*()ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let password = ''
  for (let i = 0; i <= length; i++) {
    const randomNumber = Math.floor(Math.random() * chars.length)
    password += chars.substring(randomNumber, randomNumber + 1)
  }
  return password
}

export function popFromObject(key: string, object: any): any {
  const item = object[key]
  delete object[key]
  return item
}

export function encodeUrl(url: string): string {
  return url
    .split('/')
    .map((e) => encodeURIComponent(e))
    .join('/')
}

export function decodeUrl(url: string): string {
  return url
    .split('/')
    .map((e) => decodeURIComponent(e))
    .join('/')
}

export function objectPropertyFromString(obj: any, property: string): any {
  const a = property.split('.')
  let o = obj
  for (let i = 0, n = a.length; i < n; i++) {
    const k = a[i]
    if (k in o) {
      o = o[k]
    } else {
      return null
    }
  }
  return o
}

export function capitalizeString(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function intersectPermissions(aPermissions: string, bPermissions: string, permissionsSeparator: string = SPACE_PERMS_SEP): string {
  const aPerms = aPermissions.split(permissionsSeparator)
  const bPerms = bPermissions.split(permissionsSeparator)
  return aPerms
    .filter((p: string) => p !== '' && p !== 'null' && bPerms.indexOf(p) > -1)
    .sort()
    .join(permissionsSeparator)
}
