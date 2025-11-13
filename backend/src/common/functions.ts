/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { parse as parseMs } from '@lukeed/ms'
import bcrypt from 'bcryptjs'
import { ClassTransformOptions, plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { ValidationError } from 'class-validator/types/validation/ValidationError'
import { ValidatorOptions } from 'class-validator/types/validation/ValidatorOptions'
import crypto from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { SPACE_PERMS_SEP } from '../applications/spaces/constants/spaces'

export const regexpEscape = /[.*+?^${}()|[\]\\]/g
export const regexSpecialChars = /[-[\]{}()*+!<=:?./\\^$|#,]/g
export const regexSpecialCharsWithSpace = /[-[\]{}()*+!<=:?./\\^$|#\s,]/g

export async function loadOptionalModule(moduleName: string): Promise<any> {
  return await import(moduleName)
}

export async function sleep(ms: number): Promise<void> {
  await setTimeout(ms)
}

export function escapeSQLRegexp(input: string): string {
  return input.replace(regexSpecialCharsWithSpace, '\\\\$&').replaceAll("'", "''")
}

export function escapeString(input: string): string {
  return input.replace(regexSpecialChars, '\\$&')
}

export function escapePath(path: string): string {
  return path.replace(regexpEscape, '\\$&')
}

export function regExpPathPattern(path: string): RegExp {
  return new RegExp(`^${escapePath(path)}[/\\\\]`)
}

export function convertHumanTimeToSeconds(value: string): number {
  return parseMs(value) / 1000
}

export function convertHumanTimeToMs(value: string): number {
  return parseMs(value)
}

export function formatDateISOString(date: Date): string {
  return date.toISOString().replaceAll('-', '.').replaceAll(':', '-').replace('T', ' ').replace('Z', '')
}

export function urlToPath(url: string): string {
  // transform https://sync-in.com/webdav/ to /webdav/
  try {
    // transform https://sync-in.com/webdav/ to /webdav/
    return new URL(url).pathname
  } catch {
    // or allows uri like : /webdav/
    return url
  }
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

export function generateShortUUID(length: number = 32, encoding: BufferEncoding = 'base64url'): string {
  const bytes = Math.ceil((length * 3) / 4) // adapt to real length
  return crypto.randomBytes(bytes).toString(encoding)
}

export function anonymizePassword(obj: { password?: string; secrets?: string }) {
  return { ...obj, ...(obj?.password && { password: '********' }), ...(obj?.secrets && { secrets: '********' }) }
}

export function splitFullName(fullName?: string): { firstName: string; lastName: string } {
  if (!fullName || !fullName.trim()) return { firstName: '', lastName: '' }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    return { firstName: '', lastName: parts[0] }
  }
  const lastName = parts.pop()!
  const firstName = parts.join(' ')
  return { firstName, lastName }
}

export function transformAndValidate<T extends object>(
  schema: new () => T,
  object: any,
  transformOptions: ClassTransformOptions = {},
  validatorOptions: ValidatorOptions = {}
): T {
  // warning: plainToInstance do not use constructor to instantiate class
  const instance: T = plainToInstance(schema, object, transformOptions)
  const errors: ValidationError[] = validateSync(instance, validatorOptions)
  if (errors.length > 0) {
    throw new Error(errors.toString())
  }
  return instance
}

export function uniquePermissions(permissions: string, permissionsSeparator: string = SPACE_PERMS_SEP) {
  /*
    Returns unique permissions : 'c:r:w:c:r' -> 'c:r:w'
  */
  if (permissions.length === 0) return permissions
  return [
    ...new Set(
      permissions
        .split(permissionsSeparator)
        .filter((p: string) => p && p !== 'null')
        .sort()
    )
  ].join(permissionsSeparator)
}

export function differencePermissions(aPermissions: string, bPermissions: string, permissionsSeparator: string = SPACE_PERMS_SEP): string[] {
  const aPerms = aPermissions.split(permissionsSeparator)
  const bPerms = bPermissions.split(permissionsSeparator)
  return aPerms.filter((p: string) => p !== '' && bPerms.indexOf(p) === -1).sort()
}

export function sortObjByName(a: { name: string }, b: { name: string }, asc = false): 0 | 1 | -1 {
  const aN = a.name.toLowerCase()
  const bN = b.name.toLowerCase()
  if (asc) {
    return aN < bN ? 1 : aN > bN ? -1 : 0
  } else {
    return aN < bN ? -1 : aN > bN ? 1 : 0
  }
}

function diffProperties(a: any, b: any, props: string[]): boolean {
  for (const p of props) {
    if (a[p] !== b[p]) {
      return false
    }
  }
  return true
}

export function diffCollection<T>(
  curCollection: T[],
  newCollection: T[],
  updateProps: string[],
  compareProps: string[] = ['id']
): [T[], Record<string | 'object', { old: any; new: any } | T>[], T[]] {
  const toAdd: T[] = []
  const toUpdate: Record<string | 'object', { old: any; new: any } | T>[] = []
  const toRemove: T[] = curCollection.filter((c: T) => !newCollection.find((n: T) => diffProperties(c, n, compareProps)))
  for (const n of newCollection) {
    const o = curCollection.find((c: T) => diffProperties(c, n, compareProps))
    if (o) {
      const diff: Record<string | 'object', { old: any; new: any } | T> = {}
      for (const p of updateProps.filter((p: string) => n[p] !== o[p])) {
        diff[p] = { old: o[p], new: n[p] }
      }
      if (Object.keys(diff).length) {
        diff['object'] = n
        toUpdate.push(diff)
      }
    } else {
      toAdd.push(n)
    }
  }
  return [toAdd, toUpdate, toRemove]
}

export function convertDiffUpdate(update: Record<string | 'object', { old: any; new: any } | any>[]): Record<string | 'object', any>[] {
  // only keep the new values
  return update.map((o) => Object.fromEntries(Object.entries(o).map(([p, v]) => [p, p === 'object' ? v : v.new])))
}
