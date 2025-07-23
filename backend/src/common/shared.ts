/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

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
