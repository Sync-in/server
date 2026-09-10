export interface AvailabilityHealthResponse {
  status: 'ok' | 'unavailable'
}
export type AvailabilityDependency = 'database' | 'cache' | 'websocket'
