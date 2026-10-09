import { isIP } from 'node:net'
import { z } from 'zod'

const MAX_URL_LENGTH = 2084
const HTTP_AUTHORITY_REGEX = /^https?:\/\/([^/?#]*)/i
export const nonEmptyStringSchema = z.string().min(1)
const httpUrlCandidateSchema = z.url({ protocol: z.regexes.httpProtocol }).max(MAX_URL_LENGTH)

// z.httpUrl validates domains and TLDs but excludes IP hosts accepted by the former IsUrl contract.
const httpIpUrlSchema = httpUrlCandidateSchema.refine((value) => {
  const url = URL.parse(value)
  return url !== null && isIP(urlHostname(url)) !== 0
}, 'URL hostname must be a valid IP address')

export const httpUrlSchema = z.union([z.httpUrl().max(MAX_URL_LENGTH), httpIpUrlSchema]).check(httpUrlCheck())

export const httpBaseUrlSchema = httpUrlCandidateSchema.check(httpUrlCheck(true))

export const optionalHttpBaseUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() || null : value),
  httpBaseUrlSchema.nullish()
)

// Preserve the former IsInt contract for number-based SQL IDs and storage limits.
// Zod's .int() additionally restricts numbers to the safe integer range.
export const integerNumberSchema = z.number().refine(Number.isInteger, { message: 'Expected an integer' })

export const integerFromStringSchema = z
  .string()
  .regex(/^-?\d+$/)
  .transform((value) => Number(value))
  .pipe(integerNumberSchema)

export const safeIntegerFromStringSchema = integerFromStringSchema.pipe(z.number().int())

export const positiveIntegerFromStringSchema = safeIntegerFromStringSchema.pipe(z.number().positive())

export const booleanFromStringSchema = z.stringbool({ truthy: ['true'], falsy: ['false'], case: 'sensitive' })

function urlHostname(url: URL): string {
  const { hostname } = url
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

function httpUrlCheck(isBaseUrl = false) {
  return z.superRefine<string>((value, ctx) => {
    const url = URL.parse(value)
    if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) return

    const authority = HTTP_AUTHORITY_REGEX.exec(value)?.[1]
    const addIssue = (message: string) => ctx.addIssue({ code: 'custom', input: value, message })

    if (!authority) addIssue('URL must contain an explicit HTTP(S) authority')
    if (url.port === '0') addIssue('URL port must be between 1 and 65535')
    if (!isBaseUrl) return

    const hostname = urlHostname(url)
    if (isIP(hostname) === 0 && (!z.regexes.hostname.test(hostname) || hostname.endsWith('.'))) {
      addIssue('URL hostname must be a valid IP address or hostname')
    }
    if (authority?.includes('@') || value.includes('?') || value.includes('#')) {
      addIssue('URL must not contain authentication, query parameters, or a fragment')
    }
  })
}

export function isConfigRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function hydrateConfigDefaults<T extends object>(defaults: T, value: unknown): T | unknown {
  // Inactive sections keep their unvalidated values, including explicit undefined overrides.
  return isConfigRecord(value) ? Object.assign(defaults, value) : value
}
