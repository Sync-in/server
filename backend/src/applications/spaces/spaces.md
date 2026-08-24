# Spaces

The `spaces` module manages collaborative spaces, anchored roots, external roots, and the logical repositories used to browse their files and trash.

## Collaboration and access model

A collaborative space is an independent ownership and permission boundary. Its managed files, trash, quota, content-indexing setting, members, roots,
and shares are attached to the space rather than to an individual member. Access requires both the corresponding application permission and an
effective membership obtained directly, through a group, as a guest, or through a space link.

Members can read an accessible space. Additional operations are granted independently:

| Operation | Backend permission | Meaning                                                 |
|-----------|--------------------|---------------------------------------------------------|
| Add       | `ADD`              | Create, upload, copy, or move content into a location   |
| Modify    | `MODIFY`           | Edit content and manage locks                           |
| Delete    | `DELETE`           | Delete content or move it out of its current location   |
| Anchor    | `SHARE_INSIDE`     | Add personal content as a virtual root inside the space |
| Share     | `SHARE_OUTSIDE`    | Create a share from content exposed by the space        |

A move requires `DELETE` on the source and `ADD` on the destination. Space managers receive every space-level operation and can manage the space, its
members, roots, quota, indexing setting, and shares. This does not bypass the permissions attached to an anchored root.

## Anchored root model

An anchored root exposes a file or directory from a member's personal files at the top level of a collaborative space. The `spaces_roots.fileId`
reference preserves the source identity: no content is copied and the personal repository remains the storage owner. Moving or renaming the source
inside that repository updates the same file record, so the anchor remains valid.

The root `alias` is its unique path segment inside the space, while `name` is its display name. Both can differ from the source name without renaming
the backing resource. Removing the root only removes this virtual exposure; it does not delete the source content. The anchored endpoint itself is
protected from file deletion, while its children remain subject to the effective file permissions described below.

Anchoring requires `SHARE_INSIDE`. The permissions effective below the root are the intersection of the member's space permissions and the root
permissions defined by its owner. Denial from either side denies the operation, including for space managers. Creating a share from anchored content
likewise requires `SHARE_OUTSIDE` in both permission sets, and a member cannot delegate permissions they do not effectively hold.

Anchored roots are first-class virtual locations for browser, search, WebDAV, synchronization, comments, and favorites consumers. These consumers must
resolve the backing file identity and canonical storage scope instead of treating the root alias as a physical directory.

Removing an anchored root also removes shares tied to that root, including their descendant shares. Roots owned by a member are removed when that
member leaves the space. For a regular member, losing `SHARE_INSIDE` blocks further root management, while losing `SHARE_OUTSIDE` prevents new shares;
neither permission loss removes the corresponding existing roots or shares by itself.

## Space lifecycle

A manager can deactivate a space, while an administrator can delete it immediately. A disabled space is inaccessible to its members and its trash is
not browsable. Reactivation restores access before expiry; otherwise the scheduler permanently removes a space after 30 disabled days.

## Managed space storage

A native space has a managed home under the configured spaces path:

```text
spaces/<space-alias>/
├── files/
├── trash/
└── tmp/
    └── users/
        └── <actor-id>/
```

The `files` and `trash` directories are created with the space. Temporary directories are created lazily when an operation needs them.

An external root is only a view of an existing filesystem location. Sync-in does not create a trash directory inside it:

```text
<external-root>/
└── <existing-content>
```

In particular, `<external-root>/.trash/` is not part of the storage layout. Such a directory would not correspond to a logical trash repository, so
the trash list, browser, restore operations, and retention scheduler could not discover or empty it.

## External locations

An external location is an existing server directory exposed at the top level of a collaborative space through a `spaces_roots.externalPath` record.
It has no backing `fileId` and must not be confused with a member-owned anchor from personal files. No data is copied into the managed space home; the
root alias remains a virtual path segment while all content stays under the configured external directory.

Only an administrator can register an external location. The administration preflight verifies that the path exists and that the operating-system
account running the server can read and write it. Those filesystem permissions must remain valid after registration. The raw external path is hidden
from non-administrator space responses.

External-root usage is included in the native space's `storageUsage` together with its managed home and other external roots. The native space quota
therefore remains authoritative even though the content is physically outside that home. Deleting a child from the external location moves it into
the native space trash, removes its external-root storage identity, and makes it subject to the space's trash permissions and retention policy.

## Logical trash repositories

Trash repositories are addressed without a root level:

```text
trash/personal/<path>
trash/<space-alias>/<path>
```

Every segment after `personal` or `<space-alias>` is treated as a path inside the selected trash. A space root alias is therefore not resolved while
browsing trash. For an external root, the trash path is relative to the external root itself and does not include its alias.

The trash list examines the personal trash and every space available to the user. It returns only repositories containing at least one visible
top-level entry. Internal temporary entries are always ignored; hidden entries follow the
`showHiddenFiles` configuration.

## Deletion target resolution

Deletion resolves one authoritative target from the source context and its managed ownership:

| Source                                                | Deletion target                      |
|-------------------------------------------------------|--------------------------------------|
| Personal files                                        | `users/<actor-login>/trash/`         |
| Files stored in a native space home                   | `spaces/<space-alias>/trash/`        |
| External root attached to a native space              | `spaces/<space-alias>/trash/`        |
| Root anchored to another user's personal files        | `users/<owner-login>/trash/`         |
| Share backed by personal files                        | `users/<owner-login>/trash/`         |
| Native-space-backed share, including an external root | `spaces/<origin-space-alias>/trash/` |
| External share                                        | Permanent deletion                   |

The authenticated user is the actor. The owner is the user or native space whose managed storage contains, or logically owns, the source.

An external root attached to a native space deliberately uses the native space's managed trash. An external share has no managed storage owner and is
deleted permanently, regardless of the actor type. There is no fallback to
`<external-root>/.trash/` and no migration from such a directory.

### Trash permissions and anchored roots

Anchored root endpoints are virtual and cannot be deleted through file operations. Operations on their children use the intersection of the member's
space permissions and the root permissions. This protection applies to the endpoint exposed by the space; it does not make the backing source
immutable in its original repository.

When a root is anchored to a file or directory in a user's personal storage, deleting one of its children moves that entry to the personal trash of
the root owner. It does not enter the native space trash, and other space members do not gain control over it through their space permissions. Native
space files that are not anchored continue to use the native space trash.

An anchored descendant is resolvable only while it remains in the same canonical storage scope as the backing root. This scope includes `ownerId`,
`spaceId`, `spaceExternalRootId`, `shareExternalId`, and `inTrash`, in addition to the descendant path. Moving a child to the owner's personal trash
changes that scope and places it in a different logical and physical repository. The child therefore leaves the anchored tree immediately: the root
endpoint remains active, but the deleted child cannot be reached through it or through the native space trash. Only an actor with access to the
owner's personal trash can resolve the moved entry there.

External roots are the exception. Deleting a child from an external root still requires the effective `DELETE` permission in the source context, but
the entry then becomes owned by the native space trash. Its external-root identity and root permissions are not retained there, so subsequent trash
operations use the space permissions. A member with `DELETE` on the space can therefore move the entry out of trash or delete it permanently. Moving
it to another repository, including restoring it to an external root, additionally requires `ADD` on the destination.

## Deletion lifecycle

For a resource whose target is a managed trash, deletion performs the following operations:

1. Resolve the managed trash and its temporary root from the source space.
2. Recreate the source's relative parent path in that trash when required.
3. If the destination name already exists, preserve the existing trash entry under a dated unique name in both the filesystem and database. A numeric
   suffix is added when that dated name is already occupied.
4. Move the resource to the selected trash.
5. Move the corresponding database records into the trash's canonical scope and remove their locks.

The newly deleted resource keeps its original name. When a deletion runs as a cancellable task and the source and trash are on different filesystems,
it can stage the transfer in the temporary directory belonging to the selected managed trash before publishing it.

Trash database scopes follow the managed owner, independently of the source root:

| Trash        | Canonical database scope                                                                                        |
|--------------|-----------------------------------------------------------------------------------------------------------------|
| Personal     | `ownerId = <owner>`, `spaceId = null`, `spaceExternalRootId = null`, `shareExternalId = null`, `inTrash = true` |
| Native space | `ownerId = null`, `spaceId = <space>`, `spaceExternalRootId = null`, `shareExternalId = null`, `inTrash = true` |

Moving an entry into trash updates its existing database record rather than deleting and recreating it. Its file identifier and attached relations are
therefore preserved. A collision is resolved against the canonical destination scope before the incoming record is moved into it. In particular,
entries from different external roots converge on the same native-space trash scope.

When a resource is restored with overwrite to the location from which it was deleted, its own trash path is protected for the duration of the
operation. The overwritten destination is archived under a dated name instead, so the active restore source keeps the same filesystem path and
database identity.

For an external share, deletion skips this lifecycle and removes the source directly from the filesystem and database.

Deleting a resource that is already under `trash/...` removes it permanently from the filesystem and database. The trash itself is a protected virtual
endpoint and cannot be deleted. New files, uploads, and in-place modifications are rejected in trash; a resource can be restored by moving it from
trash to a writable files repository. That move replaces the canonical trash scope with the selected destination scope, including an external-root
identifier when the destination is an external root.

## Events and quotas

A deletion that remains in the same logical ownership scope emits a `DELETE`
event. It does not trigger a quota update because moving an entry into trash is not considered a logical storage removal.

An external share has no managed owner or trash destination. Its resources are removed directly and emit `DELETE_PERMANENTLY`.

## Automatic retention

Trash retention is configured independently for user and native-space repositories:

```yaml
applications:
  files:
    trashRetention:
      users: false
      spaces: false
```

Each value accepts a positive integer number of days. `false` or `0` disables cleanup for that repository type. Cleanup runs at application startup
and then daily at 02:00 according to the server scheduler.

For space retention, only enabled native spaces are indexed. The scheduler scans `spaces/<space-alias>/trash/`, records entries in disposable
retention tables, removes expired files before directories, and retries filesystem deletion failures on a later run. Paths loaded from retention
tables are resolved and checked against the managed trash root before deletion.

Retention never scans external roots for `.trash` directories. All deletions owned by a native space are visible to the same browser and retention
flow because they converge on `spaces/<space-alias>/trash/`.
