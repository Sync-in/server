type CacheRevisionExpectation = { expect: 'absent'; expectedLockId?: never } | { expect: 'present'; expectedLockId?: string }

export const CACHE_REVISION_MAX_MUTATIONS = 1_000
export const CACHE_REVISION_MAX_SNAPSHOT_ENTRIES = 1_000

export type CacheRevisionMutation =
  | ({ type: 'set'; key: string; value: unknown; ttl?: number } & CacheRevisionExpectation)
  | ({ type: 'delete'; key: string } & CacheRevisionExpectation)

export interface CacheRevisionSnapshotCommand {
  revisionKey: string
  pattern: string
}

export interface CacheRevisionSnapshot {
  revision: string | null
  entries: { key: string; value: unknown }[]
}

export interface CacheRevisionMutationCommit {
  revisionKey: string
  mutations: readonly CacheRevisionMutation[]
}

/**
 * Atomically applies at most CACHE_REVISION_MAX_MUTATIONS after checking the persistent sidecar and every mutation precondition.
 * A false result is reserved for a stale revision or mutation precondition; technical failures reject the whole batch.
 */
export interface CacheRevisionCommit extends CacheRevisionMutationCommit {
  // null requires the sidecar to be absent.
  expectedRevision: string | null
}
