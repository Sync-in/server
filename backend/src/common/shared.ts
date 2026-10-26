/* THIS FILE IS SHARED WITH THE FRONTEND PACKAGE */

import { SPACE_PERMS_SEP } from '../applications/spaces/constants/spaces.js'

export const SERVER_NAME = 'Sync-in' as const
export const RELEASES_URL = 'https://releases.sync-in.org' as const

export const APP_URL = {
  WEBSITE: 'https://sync-in.com',
  RELEASES: 'https://github.com/Sync-in/server/releases',
  SERVER_VERSION_MANIFEST: `${RELEASES_URL}/sync-in-server/latest.json`
} as const

// eslint-disable-next-line no-control-regex
export const regExpInvalidFileName = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$|[<>:"/\\|?*\x00-\x1f\x80-\x9f]/
export const regExpPreventPathTraversal = /^(\.\.(\/|\\|$))+/
export const regExpNumberSuffix = /-\d+$/
export const regExpLetterOrNumber = /[\p{L}\p{N}]/u
export const forbiddenChars = '\\ / : * ? " < > |'

export class InvalidSlugError extends Error {
  constructor() {
    super('Name must contain at least one letter or number')
    this.name = InvalidSlugError.name
  }
}

export function isValidFileName(fileName: string) {
  if (regExpInvalidFileName.test(fileName)) {
    throw new Error('Forbidden characters')
  }
}

export function currentTimeStamp(date?: Date | null, ms = false): number {
  return Math.floor((date ? date : new Date()).getTime() / (ms ? 1 : 1000))
}

export function currentDate(value?: string): Date {
  return new Date((value ? value : new Date().toISOString()).split('T')[0])
}

export function createSlug(input: string, replaceCount = false): string {
  // Collapse runs of characters other than Unicode letters or numbers into one hyphen, then trim edge hyphens.
  // When replaceCount is true, also remove an existing trailing numeric suffix (e.g. -2).
  let slug = createLightSlug(input)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')

  if (replaceCount) {
    slug = slug.replace(regExpNumberSuffix, '')
  }
  if (!slug) {
    throw new InvalidSlugError()
  }
  return slug
}

export function createCacheKeySlug(args: unknown[]) {
  // Keep accents distinct while sharing keys across case and canonical Unicode forms.
  // Escape reserved characters before joining arguments; only a whole `*` argument is a wildcard.
  return args
    .map((arg) => {
      if (arg == null) return '~null'
      if (arg === '*') return '*'
      return String(arg)
        .toLowerCase()
        .normalize('NFC')
        .replace(/[%:~*"'\x60]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase())
    })
    .join(':')
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

export function stripMatchingQuotes(value: string): string {
  return value.replace(/^(["'])(.*)\1$/s, '$2')
}

export function intersectPermissions(aPermissions: string, bPermissions: string, permissionsSeparator: string = SPACE_PERMS_SEP): string {
  const aPerms = aPermissions.split(permissionsSeparator)
  const bPerms = bPermissions.split(permissionsSeparator)
  return aPerms
    .filter((p: string) => p !== '' && p !== 'null' && bPerms.indexOf(p) > -1)
    .sort()
    .join(permissionsSeparator)
}
