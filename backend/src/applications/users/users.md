# Users

The `users` module manages regular users, guests, link pseudo-users, their home directories, and their temporary files.

## User types

Every persisted identity has a `USER_ROLE`. The role identifies the kind of user and also forms an ordered authorization hierarchy:

```text
ADMINISTRATOR (0) < USER (1) < GUEST (2) < LINK (3)
```

Lower values have more privileges. `UserModel.haveRole(requiredRole)` checks
`user.role <= requiredRole`; consequently, a route requiring `USER` accepts administrators and regular users, while a route requiring `LINK` accepts
every authenticated user type. The numeric order is therefore security-sensitive and must not be changed without reviewing every role check.

| Role                  | Type             | Characteristics                                                                                                                                                                                                                                                                                                 |
|-----------------------|------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ADMINISTRATOR` (`0`) | Administrator    | A regular account with complete access. Both `isAdmin` and `isUser` are `true`; application permission checks always succeed, and the account has a complete regular-user home.                                                                                                                                 |
| `USER` (`1`)          | Regular user     | A standard managed account. Available applications come from its assigned `permissions`; the account has personal files, trash, temporary files, and optional avatar files.                                                                                                                                     |
| `GUEST` (`2`)         | Guest            | A managed external account associated with one or more managers. Its applications are fixed to spaces, shares, and WebDAV, but it never has a personal space. It has temporary and optional avatar files, but no personal files or trash.                                                                       |
| `LINK` (`3`)          | Link pseudo-user | An internal account created for a space or share access link. It cannot use the normal login flow and authenticates through the link UUID and optional password. It is restricted to the linked space or share, is excluded from user searches, and has only an identifier-based temporary home created lazily. |

`UserModel.isUser` includes both `ADMINISTRATOR` and `USER`. `isGuest` and
`isLink` match only their exact roles. `USER_GROUP_ROLE` values (`MEMBER` and
`MANAGER`) describe membership inside a group and are independent of these user types.

## Homes and temporary files

Temporary working data is stored with the targeted storage rather than with the authenticated actor. Archives produced for user download are the
exception: they are stored in the actor's home until their task is removed or expires.

All paths in this section are relative to the configured application data path, unless an external storage root is explicitly shown.

### Regular user home

A regular user has a complete home containing personal files, trash, temporary files, and optional avatar files:

```text
users/<login>/
├── files/
├── trash/
├── tmp/
├── avatar.png
└── avatar.json
```

### Guest home

Guests share the same login namespace and `users` root as regular users. A guest has no personal files or trash repository:

```text
users/<login>/
├── tmp/
├── avatar.png
└── avatar.json
```

The avatar files are optional. The guest home follows the guest lifecycle and is created, renamed, and removed with the guest.

### Link home

A link pseudo-user has a minimal home dedicated to downloadable artifacts:

```text
links/<link-user-id>/
└── tmp/
```

`<link-user-id>` is the immutable numeric identifier of the link pseudo-user, not its login. The home is created lazily and removed with the link.

### Target temporary storage

Working files targeting a native space are isolated by actor:

```text
spaces/<space-alias>/
├── files/
├── trash/
└── tmp/
    └── users/
        └── <actor-id>/
```

For storage without a managed native-space home, working files are stored under the physical storage root:

```text
<storage-root>/.sync-in-tmp/users/<actor-id>/
```

The temporary-path resolver determines the physical storage behind a space or share, selects the corresponding actor directory, and keeps the
resulting path inside that temporary root. Temporary directories are created lazily when first needed.

`.sync-in-tmp` is an internal reserved directory. It is never exposed through filesystem browsing, search, content indexing, archives, recursive
copies, or Sync diffs, even when hidden files are enabled. Direct requests targeting this directory are rejected.

Target working files never use the authenticated actor's home `tmp` directory. There is no additional `staging` directory.

### Temporary-file names

Every operation artifact follows the same naming convention:

```text
~tmp-<operation>-<execution-id>-<basename>
```

The components have the following meaning:

- `<operation>` is the underlying operation, such as `upload`, `download`,
  `compress`, `decompress`, `copy`, `move`, `delete`, or `avatar`;
- `<execution-id>` is a generated UUID for a direct operation;
- `<execution-id>` is `task.id` for an operation executed as a task;
- `<basename>` is a sanitized basename, truncated when required by filesystem filename limits.

Examples:

```text
~tmp-upload-550e8400-e29b-41d4-a716-446655440000-report.pdf
~tmp-download-6c105f70-f5c4-49af-94b9-f341bbaa1047-video.mp4
~tmp-compress-6c105f70-f5c4-49af-94b9-f341bbaa1047-photos.zip
~tmp-decompress-6c105f70-f5c4-49af-94b9-f341bbaa1047-archive
~tmp-avatar-550e8400-e29b-41d4-a716-446655440000-avatar.png
```

The actor identifier is already present in the parent path and is not repeated in the filename.

The `.sync-in.*` files used by Sync have a separate lifecycle and do not follow this convention. Their prefix is also reserved: these entries and
directories are excluded from filesystem browsing, search, content indexing, archives, recursive copies, task metrics, and Sync diffs. Sync creates
and manages them internally while publishing the corresponding destination file.

### Direct operation lifecycle

Direct operations create their working artifacts in the target temporary directory. This includes:

- staged HTTP and multipart overwrites;
- staged WebDAV overwrites;
- downloads from a URL;
- compression into the target directory;
- decompression;
- copy and move staging when an operation requires it;
- other intermediate files associated with a destination.

New files and resumable uploads may write directly to their destination when the destination itself is the required checkpoint; they do not create a
separate temporary artifact.

After validation, an artifact is moved to its final destination. It is removed when validation, publication, or an earlier operation step fails.

Avatar updates are profile operations rather than target-storage operations. An avatar is prepared in the user or guest home `tmp` directory before
being published as `avatar.png` at the home root.

### Task artifact lifecycle

A task is the asynchronous execution of an existing operation. Task artifacts therefore use the operation naming convention with the task identifier:

```text
~tmp-<task.type>-<task.id>-<basename>
```

Task working artifacts remain with the target. For example:

```text
spaces/project/tmp/users/42/~tmp-decompress-<task-id>-archive
<external-root>/.sync-in-tmp/users/42/~tmp-copy-<task-id>-directory
```

All artifacts belonging to a task share the following prefix:

```text
~tmp-<task.type>-<task.id>-
```

### Downloadable task archives

A compression task with `compressInDirectory` set to `false` produces an archive for user download. Unlike other task artifacts, this archive is
created and kept in the actor's home:

```text
USER   -> users/<login>/tmp/~tmp-compress-<task-id>-photos.zip
GUEST  -> users/<login>/tmp/~tmp-compress-<task-id>-photos.zip
LINK   -> links/<link-user-id>/tmp/~tmp-compress-<task-id>-photos.zip
```

The physical filename is internal. `task.name` contains the logical filename presented to the user. The download response uses that logical name
explicitly:

```ts
new SendFile(archivePath, task.name)
```

For example, the physical file
`~tmp-compress-<task-id>-photos.zip` is downloaded as `photos.zip`.

### Cleanup

An operation removes its working artifact after successful publication or after an error. Consequently, completed copy, move, download, compression,
and decompression tasks do not retain working artifacts on their target storage.

When a downloadable archive task is removed, the task manager removes its retained archive using the task ownership prefix:

```text
~tmp-<task.type>-<task.id>-
```

The scheduler scans user, guest, link, native-space, personal-storage, and registered external-storage temporary roots. It preserves prefixes owned by
a task that is still cached. Target-storage roots remove expired orphaned
`~tmp-*` artifacts; home `tmp` directories also remove expired legacy entries. These files may be left by a process crash, interruption, task-cache
expiration, or an earlier storage layout. The scheduler acts as a recovery mechanism and does not replace normal operation or task cleanup.

The former `tmp/guests` and `tmp/links` paths are not part of this layout and do not receive compatibility cleanup.
