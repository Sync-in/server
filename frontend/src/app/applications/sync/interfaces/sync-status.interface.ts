export interface SyncStatus {
  syncPathId: number
  state: boolean
  reportOnly: boolean
  mainError?: string
  lastErrors?: any[]
}
