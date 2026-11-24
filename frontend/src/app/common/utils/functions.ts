import { UrlSegment } from '@angular/router'
import { BYTE_UNITS, encodeUrl } from '@sync-in-server/backend/src/common/shared'
import { themeDark, themeLight } from '../../layout/layout.interfaces'
import { escapeRegexp } from './regexp'

export { convertTextToBytes } from '@sync-in-server/backend/src/common/shared'
export const reservedUrlChars = new Map([
  ['#', '%23'],
  ['?', '%3F'],
  ['%', '%25'],
  [' ', '%20']
])

function encodeReservedUrlChars(url: string): string {
  // string is already encoded, decode it before replacing blocking chars
  // string will be re-encoded after in the AuthInterceptor
  let decodedUrl: string
  try {
    decodedUrl = decodeURIComponent(url)
  } catch (e) {
    console.warn(e)
    decodedUrl = url
  }
  const buffer: string[] = []
  for (const char of decodedUrl) {
    buffer.push(reservedUrlChars.get(char) || char)
  }
  return buffer.join('')
}

export function hasReservedUrlChars(url: string): false | string {
  for (const char of reservedUrlChars.keys()) {
    if (url.indexOf(char) > -1) {
      return encodeReservedUrlChars(url)
    }
  }
  return false
}

export function pathSlice(value: string, start = 0, end: number = undefined): string {
  if (!value) return value
  return value.split('/').slice(start, end).join('/')
}

export function ifStringContains(content: string, search: string) {
  if (content?.length) {
    return content.indexOf(search) > -1
  }
  return false
}

export function genRandomUUID(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function convertBytesToText(bytes: number, precision = 0, zero = false): string {
  if (bytes === 0) {
    return zero ? '0 KB' : ''
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = (bytes / Math.pow(1024, Math.floor(exponent))).toFixed(precision)
  return `${value} ${BYTE_UNITS[exponent]}`
}

export function getNewly(value: string | number | Date, withWarning = false): 0 | 1 | 2 | 3 | 4 {
  if (!value) {
    return 0
  }
  const timestamp = Math.round(+new Date())
  const objTimeStamp = typeof value === 'number' ? value : typeof value === 'string' ? new Date(value).getTime() : value.getTime()
  const timeDiff = (timestamp - objTimeStamp) / 1000
  if (timeDiff < 86400) {
    // one day
    return 1
  } else if (timeDiff < 259200) {
    // 3 days
    return 2
  } else if (timeDiff < 604800) {
    // one week
    return 3
  } else if (withWarning) {
    // warning
    return 4
  }
  return 0
}

export function togglePasswordType(input: HTMLInputElement) {
  if (input.type === 'password') {
    input.type = 'text'
  } else {
    input.type = 'password'
  }
}

export function buildUrlFromRoutes(api: string, routes: UrlSegment[], shiftingUrl = false): string {
  let url = ''
  if (shiftingUrl) {
    url += routes[routes.length - 1] ? `/${routes[routes.length - 1].path}` : ''
  } else {
    for (const route of routes) {
      url += `/${route.path}`
    }
  }
  return encodeUrl(`${api}${url}`)
}

export function pathFromRoutes(routes: UrlSegment[]) {
  let url = ''
  for (const route of routes) {
    url += `/${route.path}`
  }
  if (!url) {
    url = '/'
  }
  return url
}

export function elementIsVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return rect.top >= 100 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
}

export function getCookie(cname: string): string {
  const name = cname + '='
  const decodedCookie = decodeURIComponent(document.cookie)
  const ca = decodedCookie.split(';')
  for (let c of ca) {
    while (c.charAt(0) === ' ') {
      c = c.substring(1)
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length)
    }
  }
  return ''
}

export function titleCase(input: string) {
  if (!input) {
    return input
  }
  return input.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())
}

export const originalOrderKeyValue = () => 0

export function filterArray<T>(search: string, collection: T[], field?: string): T[] {
  const searchRegexp = new RegExp(escapeRegexp(search), 'i')
  if (field) {
    return collection.filter((obj) => searchRegexp.test(obj[field].normalize()))
  } else {
    return collection.filter((obj) => searchRegexp.test(JSON.stringify(Object.values(obj))))
  }
}

export function downloadWithAnchor(href: string, downloadName = '') {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = downloadName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

export function getTheme() {
  if (window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? themeDark : themeLight
  }
  return themeLight
}

export function increment(input: number, value?: number) {
  return input + value || 1
}

export function decrement(input: number, value?: number) {
  return input - value || 1
}

export function supportUploadDirectory(): boolean {
  return /Chrome|Firefox|Edge|Safari/.test(window.navigator.userAgent)
}

export function uniqueNameFromCollection(name: string, field: string, collection: any[]) {
  const nameExtension = name.indexOf('.') > -1 ? name.slice(name.lastIndexOf('.')) : ''
  const nameWithoutExtension = name.replace(new RegExp(`${nameExtension}$`), '')
  let finalName = `${nameWithoutExtension}${nameExtension}`
  let count = 0
  for (const item of collection) {
    if (finalName === item[field]) {
      count++
      finalName = `${nameWithoutExtension}-${count}${nameExtension}`
    }
  }
  return finalName
}
