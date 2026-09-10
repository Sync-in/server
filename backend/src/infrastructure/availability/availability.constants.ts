import type { AvailabilityDependency } from './availability.interfaces'

export const INFRASTRUCTURE_CONNECTION_RETRY_DELAY = 6000
export const INFRASTRUCTURE_DEPENDENCY = {
  DATABASE: 'database',
  CACHE: 'cache',
  WEBSOCKET: 'websocket'
} as const satisfies Record<string, AvailabilityDependency>

export const AVAILABILITY_ROUTE = {
  BASE: '/healthz',
  LIVE: 'live',
  READY: 'ready'
} as const

export const AVAILABILITY_STATUS = {
  OK: 'ok',
  UNAVAILABLE: 'unavailable'
} as const
