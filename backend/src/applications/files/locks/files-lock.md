# File-lock coordination

`FilesLockManager` coordinates WebDAV, editor, and internal locks through the
shared cache. The cache remains the source of truth across backend workers.

The coordination unit is one exact resource. A lock stored on a collection is a
real lock, but it is not inherited by its descendants. Likewise, a descendant
lock does not conflict with a lock stored on one of its ancestors.

## Exact-resource state

Each Unicode-caseless NFC resource identity has at most one cache entry:

```text
flock|<primary namespace>|<storage scope>|path:<path>
  -> { version, locks: FileLock[] }
```

The path segment uses a locale-independent Unicode caseless identity with
canonical decomposition before folding and NFC normalization afterwards. This
merges ordinary and full Unicode case variants, including final sigma (`ς`) with
normal sigma (`σ`), while keeping accents and avoiding general compatibility
normalization. `dbFilePath` keeps the original path as lock metadata.

The identity is computed before accessing the cache, so the MySQL and Redis
adapters both retain exact binary key semantics. It deliberately defines an
application identity instead of delegating matching to a database collation.

The primary namespace is an `ownerId`, `spaceId`, or `shareExternalId`. The
storage scope is explicit: `scope:native` identifies the primary storage root,
while fields such as `spaceExternalRootId:<id>` identify an external root.

`depth` and the WebDAV token are properties of a logical lock; they are not part
of the cache key. `depth` remains available so the originating protocol can
round-trip the requested value, but it does not broaden conflict checks, token
validation, refresh, or unlock to parents or descendants.

An exclusive lock is one member of `locks`. Compatible shared locks with
distinct logical keys, such as WebDAV locks with distinct tokens, are distinct
members of the same array, with their own owner, metadata, `lockId`, and
expiration. This preserves an independent lifecycle without creating one cache
entry per token. Creating a compatible shared lock with the same application,
depth, path identity, and token reuses and refreshes the existing member. This
also applies when both tokens are `null`, as with the tokenless OnlyOffice lock.

`version` is the compare-and-swap value for the complete exact-resource state.
It changes on every successful mutation. `FileLock.lockId` still identifies one
incarnation of one logical lock: refreshing that lock creates a new `lockId`, so
a late operation holding the previous member cannot refresh or remove its
replacement.

## Expiration

Logical locks keep independent expiration timestamps. Reads and transitions
must ignore expired members, even while the state entry remains present for a
different, longer-lived member.

The physical cache TTL is the greatest remaining TTL among the active members,
plus a one-second safety margin.
Refreshing one shared lock updates only that member and must not extend another
member's logical expiration. Removing one member recomputes the TTL from the
survivors; removing the final member deletes the state entry.

Expired members may be pruned by the next successful transition. Consequently,
conflict checks, token lookup, refresh, unlock, and lock discovery must all
operate on the active members rather than returning the array verbatim.

## Decision model

The following operations inspect only the state entry whose Unicode-caseless
NFC path identity matches the requested `dbFile.path`:

- create and create-or-refresh conflict checks;
- explicit conflict checks;
- token lookup;
- refresh and unlock;
- lock capture before removal.

The existing shared/exclusive compatibility rules apply to the active members of
that exact state. Creating a compatible shared lock appends a logical member
when its logical key is new; creating the same logical lock refreshes its
existing member. Refreshing or unlocking by token changes only the matching
member.
An exact-resource state accepts at most 1,000 active logical locks, bounding the
payload and work of every CAS transition.

Collection locks are therefore stored, returned, refreshed, and unlocked like
file locks, but they do not implicitly protect collection members. Operations on
the collection itself, including its removal, still see the exact collection
state.

## Atomic transitions

Every decision is a single-key read-modify-CAS operation. Creation first tries
the absent-state CAS directly; an existing state falls back to the regular read:

1. For creation, attempt to write the state while the key is absent.
2. On an absent-state miss, or for other operations, read the exact state entry
   and its `version`.
3. Remove expired members from the in-memory view.
4. Validate the transition and compute the new `locks` array.
5. Write or delete that same entry only if its version still matches the value
   read in step 2; an absent-state creation succeeds only while the key remains
   absent.
6. Assign a new version and the maximum remaining member TTL plus the safety
   margin on a successful write.

On a definitive CAS miss, `FilesLockManager` reads the exact entry again and
retries within the bounded elapsed-time budget. Adapter, timeout, and connection
errors are otherwise propagated because an ambiguous write must not be replayed
blindly. The MariaDB adapter separately retries one `ER_LOCK_DEADLOCK`: InnoDB
has definitively rolled back the deadlock victim, so this retry cannot duplicate
a successful mutation.

There is no revision sidecar, per-token cache entry, secondary lock index,
multi-key decision snapshot, or process-local resource queue. Atomicity is
provided by the version embedded in the one exact-resource state.

Known-handle refresh and removal additionally validate the targeted member's
`lockId`. After a CAS miss they may retry only against a freshly read state; they
must never apply a stale member handle to a replacement incarnation.
Token-targeted refresh and removal capture that `lockId` during the transition's
first read, avoiding a separate lookup while preserving the same fencing on
every retry.

## Non-decision discovery and cleanup

Hierarchy is still useful for display and post-operation cleanup, but it is not a
locking decision. Listing direct child locks or collecting descendant locks after
a collection deletion or successful move may scan the exact-state keys in the
relevant storage scope and filter paths in memory.

Discovery returns exact-root locks separately from direct children indexed by
their Unicode-caseless NFC names. A collection and a child with the same name
therefore remain distinct resources in WebDAV and browser responses.

Such a scan is intentionally non-transactional and has no secondary index:

- it must not decide whether an exact resource may be mutated;
- descendant cleanup is best effort and does not apply an owner-conflict filter;
- each eventual cleanup mutation is a CAS against the descendant's own state;
- a refreshed or replaced logical lock is protected by its state version and
  `lockId`.

Exact lock capture before deleting or moving the requested resource is different:
it reads that resource's one coherent state, checks ownership according to the
existing rules, and captures only its active logical locks. A successful move
between distinct Unicode-caseless NFC identities attempts to remove the captured
source locks instead of transferring them. A rename that changes only case or
canonical Unicode representation keeps the same identity and therefore preserves
its lock state. When replacing an existing destination, its exact lock state is
preserved while obsolete descendant states are cleaned best effort.

## Storage adapters

MariaDB uses conditional single-row `UPDATE` or `DELETE` statements for a known
version. Absent-state creation uses one conditional
`INSERT ... ON DUPLICATE KEY UPDATE`: it inserts an absent key, replaces the
same complete key only when its row is expired, and rejects a live duplicate.
The absent-delete branch uses a short `SELECT ... FOR UPDATE` transaction so it
can remove an expired row safely. Redis performs the version comparison and
mutation of one key in one Lua execution. Neither adapter needs a revision
sidecar or an index of per-token entries.

Physical TTL expiry removes the complete state shortly after its last active
member is due to expire. During the safety margin the entry may still exist, but
reads treat it as logically empty. The Redis cache remains correctness-critical
and must use a non-evicting policy with enough memory for live exact-resource
states.

## Retry and failure behavior

At the `FilesLockManager` level, retries occur only after a definitive version
mismatch and use jitter within an elapsed deadline. The MariaDB adapter may also
retry one definitively rolled-back deadlock, as described above. Domain conflicts
remain domain results (`LockConflict` or `[false, lock]`, depending on the caller);
coordination exhaustion and other infrastructure failures are reported
separately.
