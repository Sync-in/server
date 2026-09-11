export interface AvailabilityHealthResponse {
  status: 'ok' | 'unavailable'
}
export type AvailabilityDependency = 'database' | 'cache' | 'websocket'
export type AvailabilityListener = (dependency: AvailabilityDependency, isAvailable: boolean) => void
