export interface SyncPathFilterMatcher {
  test(path: string): boolean
}

export interface SyncPathFilterParseBudget {
  remaining: number
}

export interface SyncPathFilterComplexity {
  programSize: number
  parseCost: number
  captureNames: string[]
}

export interface SyncPathFilterRejection {
  index: number
  pattern: string
  reason: string
}

export interface SyncPathFiltersResult {
  matcher: SyncPathFilterMatcher | null
  rejected: SyncPathFilterRejection[]
}
