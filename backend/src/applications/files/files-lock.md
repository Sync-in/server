# File-lock coordination

`FilesLockManager` coordinates WebDAV, editor, and internal file locks between every
backend process. The shared cache is the source of truth, whether the configured
backend is MariaDB or Redis.

The protocol makes changes to the lock registry atomic. It does not make the
filesystem operation protected by a lock transactional.

## Stored entries

Each live lock remains an independent cache entry with its own TTL:

```text
flock|<primary namespace>|<storage scope>|path:<path>|depth:<depth>|[token:<token>] -> FileLock
```

The primary namespace is deliberately the first variable key segment. MariaDB can
therefore restrict its prefix-index scan to one owner, space, or external share
instead of examining every `flock|...` entry. The storage scope is explicit:
`scope:native` identifies the primary storage root, while identifiers such as
`spaceExternalRootId:<id>` identify external roots.

`FileLock.lockId` is a UUID identifying one incarnation of the lock. It prevents a
late refresh or delete, holding an old `FileLock`, from changing a newer lock that
reused the same cache key. Every successful refresh creates a new incarnation and
uses the previous `lockId` as its compare-and-swap precondition.

Each primary lock registry also owns one permanent revision entry:

```text
flock-revision|ownerId:<id> -> <UUID>
flock-revision|spaceId:<id> -> <UUID>
flock-revision|shareExternalId:<id> -> <UUID>
```

The revision is a coordination sidecar, not a global lease:

- it has no TTL and is never deleted when the last lock disappears;
- it is changed only in the same atomic operation as the affected lock entries;
- workers never hold it while doing filesystem or network I/O;
- it contains no lock payload and no owner token.

There is therefore one persistent revision entry per user, space, or external-share
registry that has used file locks, plus one temporary cache entry per live file
lock. Redis also maintains one sorted-set index per active registry; it is shared by
every lock in that registry, not created once per file.

## Storage namespace

Lock keys retain the canonical storage identity in `FileDBProps`. A native root
uses `scope:native`; an external root uses its explicit identifier. Their prefix
searches are therefore disjoint even when they contain the same relative path.

The revision uses the primary identity: `ownerId`, otherwise `spaceId`, otherwise
`shareExternalId`. The file path, trash flag, and external-root identifier do not
create a separate revision, so every storage scope in one primary registry still
rotates the same coordination sidecar.

All paths that can have a parent/child conflict must resolve to the same storage
scope. Distinct scopes cannot conflict; only distinct primary registries use
distinct revision entries.

## Atomic mutations

Creating, refreshing, and deleting locks use optimistic concurrency control:

1. Read the namespace revision and relevant lock entries from one coherent backend
   snapshot.
2. Compute the complete transition in memory.
3. Submit the expected revision, the lock preconditions, and all mutations to
   `Cache.commitRevision()`; the backend generates the next revision UUID.
4. Commit only if the revision and every precondition still match.
5. On an explicit stale result, read the current state again and recompute the
   transition within a short, bounded retry budget.

Returning `false` from `commitRevision()` or `mutateRevision()` means only that
another valid transition won the race or that a lock precondition became stale.
Database, Redis, timeout, and connection errors are thrown; they are not converted
into contention.

Preconditions distinguish two cases:

- creation expects the target lock key to be absent or physically expired;
- refresh and deletion expect a live entry with the same `lockId`.

All lock preconditions are validated before the first lock mutation. MariaDB may
provisionally rotate the revision first to acquire its row lock, but that write is
rolled back with the transaction when a precondition fails. A failed precondition
therefore leaves the revision and every lock entry unchanged. File deletion captures
the exact and child lock handles before touching the filesystem, then submits those
incarnations in one batch. A lock created or replaced during the filesystem
operation is not part of that cleanup and cannot be removed accidentally.

An atomic commit accepts at most 1,000 lock mutations. This prevents an unbounded
Lua script or SQL batch; the batch is rejected before any cache write and is never
silently split into partially atomic commits.

A namespace snapshot also accepts at most 1,000 live locks. Redis enforces this
limit before growing the namespace index and before reading it, which bounds the
work performed by one atomic Lua script.

A small in-process queue serializes transitions for the same namespace before they
reach the shared backend. This avoids needless retries between requests handled by
one process without replacing the distributed compare-and-swap. Time spent waiting
in that queue is included in the bounded coordination deadline; an expired queue
entry is removed immediately without later executing its operation. CAS backoff is
performed after releasing the queue so it does not stall following local requests.

## Consistent reads

A read uses the adapter's coherent revision snapshot:

- MariaDB returns the revision row and matching lock values in one statement-level
  MVCC snapshot.
- Redis runs one atomic Lua script over the namespace sorted-set index and returns
  the revision together with its indexed lock values.

This prevents a reader from returning a mixture of two explicit lock transitions.
Physical TTL expiration does not update the revision. Expiration only removes a
lock; mutation preconditions ensure that an expired lock cannot be resurrected.

## MariaDB implementation

MariaDB implements `commitRevision()` with a short transaction:

1. Atomically compare and rotate the revision row with a conditional `UPDATE`, or
   create it with an `INSERT` when the expected revision is absent.
2. Lock the mutation rows in deterministic key order.
3. Evaluate liveness and `lockId` preconditions using database time.
4. Apply the complete set/delete batch.
5. Commit.

The preliminary revision change is still transactional: a failed precondition
rolls it back with the mutation batch. Refresh and removal of already captured
locks use `mutateRevision()` and their exact keys plus `lockId`, avoiding a
namespace scan. If a removal batch contains a stale incarnation, the manager falls
back to a coherent snapshot so that the remaining captured locks can still be
removed without touching their replacements.

Every transaction locks the revision first and mutation keys in the same order. This
keeps the deadlock surface small. A deadlock victim is retried at most once.
`ER_LOCK_WAIT_TIMEOUT` and unrelated SQL errors are propagated immediately because
they have already consumed a potentially long server-side wait.

The transaction does not remain open while the manager scans paths or performs the
protected filesystem operation. Unlike the former namespace lease, it has no lease
acquisition polling loop and no cleanup commit.

## Redis implementation

Redis implements the same contract with atomic Lua scripts for commits and
snapshots. When a snapshot revision is provided, the commit script compares it
first; direct known-key mutations skip that comparison. It validates every lock
precondition, applies all mutations, and stores the next revision without a TTL. No
write occurs before validation completes.

Each revision owns a sorted-set index named `<revision-key>|index`. Lock creation,
refresh, and deletion update that index inside the same Lua script as the lock and
revision. Finite locks use their absolute expiration as the score; persistent locks
use zero. Snapshot reads use one Lua call to remove expired or stale members and
fetch the indexed values in one bounded `MGET`, then return them with the revision.
An index containing only finite locks expires with its last lock; an index with a
persistent lock remains persistent. Reads therefore scale with the locks in one
namespace instead of scanning the complete Redis keyspace, and abandoned finite
indexes do not remain allocated indefinitely.

The lock cache is correctness-critical. Redis must use a non-evicting policy and
enough memory for the workload. Evicting a live lock, revision, or namespace index
breaks the coordination guarantee; monitor `evicted_keys` and use
`maxmemory-policy noeviction`.

The current key format and multi-key script assume a non-clustered Redis deployment.
Redis Cluster would require all entries in one transition to share a hash slot.

## Retry and failure behavior

Retries occur only after a definitive compare-and-swap miss. They use a small jitter
and an elapsed-time deadline. The manager never multiplies a SQL lock-wait timeout by
the normal contention loop.

An ambiguous infrastructure failure is propagated. In particular, a network timeout
after a commit is not blindly replayed because the first commit may already have
succeeded.

Domain conflicts remain domain results (`LockConflict` or `[false, lock]`, depending
on the caller). Coordination exhaustion and infrastructure failures are distinct and
must not be reported as an ordinary locked-file response.
