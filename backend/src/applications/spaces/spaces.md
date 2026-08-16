# Spaces

The `spaces` module manages collaborative spaces, anchored roots, external roots, and the logical repositories used to browse their files and trash.

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

## Deletion lifecycle

For a resource whose target is a managed trash, deletion performs the following operations:

1. Resolve the managed trash and its temporary root from the source space.
2. Recreate the source's relative parent path in that trash when required.
3. If the destination name already exists, preserve the existing trash entry under a dated unique name in both the filesystem and database.
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
