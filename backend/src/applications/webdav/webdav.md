# WebDAV locks

Sync-in persists WebDAV write locks in the shared lock cache. A lock is attached to
one exact resource, which may be either a file or a collection. It is not a
stateless compatibility response: the token remains usable for refresh, discovery,
unlock, and protected operations until it is removed or expires.

## Lock lifecycle

- `LOCK` creates an exclusive or shared lock and returns its opaque token in the
  `Lock-Token` header and `lockdiscovery` property.
- A bodyless `LOCK` with the token in `If` refreshes that exact lock and its TTL.
- `UNLOCK` removes the exact lock identified by `Lock-Token`.
- `PROPFIND` exposes persisted lock state through `lockdiscovery`. When several
  resources are listed, each response reports only lock state stored on that
  resource.

Exclusive locks conflict with another lock on the same resource. Compatible shared
locks may coexist on that same resource. They are stored as distinct logical
members of the resource's single versioned lock state because every WebDAV lock
has its own opaque token. Each token therefore retains its own owner, metadata,
expiration, refresh, and unlock lifecycle. The physical state TTL is the greatest
remaining TTL among those active members plus a one-second safety margin;
refreshing one token does not extend the logical lifetime of another.

`lockdiscovery` reports every active logical lock stored in the exact resource
state. A bodyless `LOCK` refreshes only the member selected by its token, and
`UNLOCK` removes only that member. When the final member is removed, the
exact-resource state disappears. When it expires, the state becomes logically
empty and its physical entry disappears after the safety margin.

## Collections and Depth

Collections can be locked with `Depth: 0` or `Depth: infinity`. The requested depth
is persisted as lock metadata and returned to WebDAV clients, but it does not make
the lock inherit to descendants. A token issued for `/collection` is valid for
`/collection` only; it cannot satisfy an `If` condition for
`/collection/child.txt`.

Consequently, creating or updating a child is not blocked by a lock stored on its
parent collection. Operations validate the exact resources they mutate: for
example, `PUT`, `PROPPATCH`, and `DELETE` validate their target, while `COPY` and
`MOVE` validate the exact source and destination resources required by the
operation.

Deleting a locked collection still requires the collection token. Once the
filesystem deletion has completed, Sync-in attempts to remove locks that had been
captured on descendants. This descendant cleanup is best effort: a cleanup failure
does not turn a completed deletion into an HTTP failure, and incarnation identifiers
ensure that a lock refreshed or replaced during deletion is not removed by a stale
cleanup handle.

A successful `MOVE` between distinct Unicode-caseless NFC path identities
attempts to remove locks captured on the source resource and, for a collection,
performs the same best-effort descendant cleanup; source locks are not transferred
to the destination URI. A rename that changes only Unicode case or canonical
Unicode representation keeps the same identity and preserves the existing lock
state.
When `COPY` or `MOVE` overwrites an existing destination, the exact destination
lock remains attached to that URI and its token is required for the overwrite,
while obsolete descendant locks are handled by the same best-effort cleanup after
the replaced collection is removed.

This is a deliberate compatibility choice rather than a strict recursive WebDAV
lock implementation. It preserves real collection locks, refresh, unlock, and lock
discovery for clients that use them, while avoiding inherited parent/child locking
and cross-resource CAS coordination on ordinary file operations. Files and
collections use the same single-key state shape; collection depth remains protocol
metadata rather than a cache-key or conflict-scope dimension.
