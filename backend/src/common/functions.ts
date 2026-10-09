import { parse as parseMs } from '@lukeed/ms'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { SPACE_PERMS_SEP } from '../applications/spaces/constants/spaces.js'
import { decodeUrl } from './shared.js'

const DUMMY_PASSWORD_HASH = '$2a$10$tjgA0v/cGe.vAfAJgNHpZeNrIdMxu82i0kGEjbtYkaVUCDkVzHRjG'

export const regexpEscape = /[.*+?^${}()|[\]\\]/g

export async function sleep(ms: number): Promise<void> {
  await setTimeout(ms)
}

export function escapePath(path: string): string {
  return path.replace(regexpEscape, '\\$&')
}

export function regExpPathPattern(path: string): RegExp {
  return new RegExp(`^${escapePath(path)}[/\\\\]`)
}

export function convertHumanTimeToSeconds(value: string): number {
  return parseMs(value)! / 1000
}

export function convertHumanTimeToMs(value: string): number {
  return parseMs(value)!
}

export function formatDateISOString(date: Date): string {
  return date.toISOString().replaceAll('-', '.').replaceAll(':', '-').replace('T', ' ').replace('Z', '')
}

export function urlToPath(url: string): string {
  // transform https://sync-in.com/webdav/ to /webdav/
  let path: string
  try {
    // transform https://sync-in.com/webdav/ to /webdav/
    path = new URL(url).pathname
  } catch {
    // or allows uri like : /webdav/
    path = url
  }
  return decodeUrl(path)
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10)
}

export async function comparePassword(password: string, hash?: string | null): Promise<boolean> {
  if (!hash) {
    // No hash, waste time for time-based attacks
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
    return false
  }
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

function diffProperties<T>(a: T, b: T, props: Extract<keyof T, string>[]): boolean {
  for (const p of props) {
    if (a[p] !== b[p]) {
      return false
    }
  }
  return true
}

export type DiffChanges<T, K extends keyof T> = {
  [P in K]?: { old: T[P]; new: T[P] }
}

export type DiffUpdate<T, K extends keyof T> = DiffChanges<T, K> & { object: T }

export type ConvertedDiffUpdate<T, K extends keyof T> = Partial<Pick<T, K>> & { object: T }

export function diffCollection<T, K extends Exclude<Extract<keyof T, string>, 'object'>>(
  curCollection: T[],
  newCollection: T[],
  updateProps: K[],
  compareProps: Extract<keyof T, string>[] = ['id' as Extract<keyof T, string>]
): [T[], DiffUpdate<T, K>[], T[]] {
  const toAdd: T[] = []
  const toUpdate: DiffUpdate<T, K>[] = []
  const toRemove: T[] = curCollection.filter((c: T) => !newCollection.find((n: T) => diffProperties(c, n, compareProps)))
  for (const n of newCollection) {
    const o = curCollection.find((c: T) => diffProperties(c, n, compareProps))
    if (o) {
      const diff: DiffChanges<T, K> = {}
      for (const p of updateProps.filter((p) => n[p] !== o[p])) {
        diff[p] = { old: o[p], new: n[p] }
      }
      if (Object.keys(diff).length) {
        toUpdate.push(Object.assign(diff, { object: n }))
      }
    } else {
      toAdd.push(n)
    }
  }
  return [toAdd, toUpdate, toRemove]
}

export function convertDiffUpdate<T, K extends keyof T>(update: DiffUpdate<T, K>[]): ConvertedDiffUpdate<T, K>[] {
  // only keep the new values
  return update.map(
    (o) =>
      Object.fromEntries(
        Object.entries(o).map(([p, v]) => [p, p === 'object' ? v : (v as unknown as DiffChanges<T, K>[K])!.new])
      ) as ConvertedDiffUpdate<T, K>
  )
}
