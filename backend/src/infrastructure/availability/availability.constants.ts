import type { AvailabilityDependency } from './availability.interfaces'

export const INFRASTRUCTURE_CONNECTION_RETRY_DELAY = 6000
export const INFRASTRUCTURE_DEPENDENCY = {
  DATABASE: 'database',
  CACHE: 'cache',
  WEBSOCKET: 'websocket'
} as const satisfies Record<string, AvailabilityDependency>
