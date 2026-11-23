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

## Account settings by role

Administrators and regular users have a complete account. They can update their profile settings, password, avatar, storage-indexing preference, 2FA,
and application passwords.

Guests have a persistent account with a reduced set of self-service settings. They can update their language, notification channel, and user
preferences, including interface, editor, and hidden-file visibility preferences. They cannot update their password or avatar, enable 2FA, manage
application passwords, or change storage indexing.

Link pseudo-users do not have a self-service account. They can read the identity required by their authenticated link session, but the account page
and all account-setting updates are unavailable to them. When a link identity is materialized, `UserModel` normalizes its preferences from an empty
value instead of using persisted account preferences.

| Account capability              | Administrator / User | Guest | Link |
|---------------------------------|----------------------|-------|------|
| Read own authenticated identity | Yes                  | Yes   | Yes  |
| Update language                 | Yes                  | Yes   | No   |
| Update notification channel     | Yes                  | Yes   | No   |
| Update user preferences         | Yes                  | Yes   | No   |
| Update password                 | Yes                  | No    | No   |
| Update avatar                   | Yes                  | No    | No   |
| Change storage indexing         | Yes                  | No    | No   |
| Enable or disable 2FA           | Yes                  | No    | No   |
| Manage application passwords    | Yes                  | No    | No   |

Language, notification channel, and storage indexing are stored as dedicated user properties. The remaining user preferences are stored together as
JSON. Preference updates are partial: omitted values remain unchanged, validated values are merged transactionally, and unchanged results do not
trigger a database write. Guests use the same persistence behavior as regular users. `showHiddenFiles` defaults to `true` when it is absent from an
existing preference document.

## Account state and password attempts

The persistent account state and the temporary authentication lock are independent controls. Password failures never change `isActive`, and reaching
the password-attempt limit does not suspend the account.

### Persistent account state (`isActive`)

`isActive` is the durable administrative switch for a local user record:

- `isActive: false` is rejected by local password and app-password paths as well as by the LDAP and OIDC provider flows;
- new authentication and token refreshes reload the local user record and reject an inactive account. Already-issued access tokens remain usable
  until they expire; positive WebDAV authentication cache entries are cleared when the account state changes;
- the account remains disabled until an administrator reactivates it; there is no automatic expiration;
- reactivating the account resets `passwordAttempts` to zero.

Public-link pseudo-users also use `isActive` as their persistent enabled or disabled state. A disabled pseudo-user cannot authenticate or access its
link.

### Temporary authentication lock

The temporary lock limits repeated checks against an active account without changing `isActive`:

- failed password, app-password, TOTP, or recovery-code checks recorded by the shared access-update path increment `passwordAttempts` up to a maximum
  of 10;
- a successful authentication resets the counter; for a TOTP-enabled login, a successful password step preserves it until the TOTP or recovery-code
  step succeeds;
- the transition from 9 to 10 attempts starts a 15-minute lock. The timestamp written to `currentAccess` by that failed attempt is the lock-period
  anchor;
- while the lock is active, password, app-password, and verification-code checks are rejected before their cryptographic comparison. These rejected
  requests do not update the access history, increment the counter, extend the lock, or send another lock notification;
- expiration is checked lazily on the next authentication attempt. A conditional database update resets the expired counter without clearing newer
  failures from a concurrent request. Only the request that successfully resets the counter continues; a concurrent request based on stale lock data
  fails closed. A new failure after reset counts as the first attempt of a new period;
- the temporary lock does not invalidate access, refresh, or websocket tokens that were issued before the lock.

The counter transition is serialized in the database so concurrent failures cannot lose increments or produce several 9-to-10 transitions. When
email delivery is available, only the request that reaches 10 attempts schedules the temporary-lock security notification. Route-level request
throttling is documented in [`auth.md`](../../authentication/auth.md#authentication-rate-limiting).

## Application permissions

Application permissions control access to features and protected operations. They are independent from the role hierarchy and from the permissions
granted inside a particular space, root, or share.

For a regular user, the effective permissions are the union of the permissions assigned directly to the account and those inherited from its user
groups. They are stored as comma-separated values and exposed by `UserModel` through the `applications` list. `UserModel.havePermission()` checks that
effective list, with the following role-specific behavior:

- administrators satisfy every application permission;
- regular users receive their direct and inherited permissions;
- guests always receive `SPACES`, `SHARES`, and `WEBDAV`, but never `PERSONAL_SPACE`;
- link pseudo-users do not use normal application permissions and are restricted to their linked context.

The available `USER_PERMISSION` values are:

| Permission              | Persisted value         | Scope                                                       |
|-------------------------|-------------------------|-------------------------------------------------------------|
| `PERSONAL_SPACE`        | `personal_space`        | Access personal files and the personal trash.               |
| `SPACES`                | `spaces_access`         | Browse spaces available to the user.                        |
| `SPACES_ADMIN`          | `spaces_admin`          | Create collaborative spaces.                                |
| `SHARES`                | `shares_access`         | Browse shares available to the user.                        |
| `SHARES_ADMIN`          | `shares_admin`          | Create and administer shares and share links.               |
| `GUESTS_ADMIN`          | `guests_admin`          | Create and administer guest accounts.                       |
| `PERSONAL_GROUPS_ADMIN` | `personal_groups_admin` | Create and administer personal groups.                      |
| `DESKTOP_APP`           | `desktop_app_access`    | Register, authenticate, and administer desktop clients.     |
| `DESKTOP_APP_SYNC`      | `desktop_app_sync`      | Configure and execute synchronization paths and operations. |
| `WEBDAV`                | `webdav_access`         | Access files through WebDAV.                                |

Permissions do not imply one another. When `@UserHavePermission()` receives an array, the guard accepts any listed permission; it does not require all
of them. Endpoint guards and storage-context checks can also impose a role, membership, or repository permission in addition to the application
permission.

For a regular user, `SPACES_ADMIN` allows space creation but does not grant management over every existing space. Updating a space, its members,
roots, or originating shares still requires the user to be one of that space's managers. Administrators can administer every space.

`SHARES_ADMIN` allows a regular user to create and administer outgoing shares and share links. When the source belongs to a collaborative space, the
effective space or anchored-root permissions must also include `SHARE_OUTSIDE`. Conversely, a space manager's oversight of existing shares originating
from that space does not depend on `SHARES_ADMIN`.

## Guest and link capabilities in collaborative spaces

Guests and link pseudo-users are content collaborators, not space administrators. Both can browse the collaborative spaces available to their
identity and can act on their content according to the effective permissions granted by the space and, when applicable, by an anchored root.

| Capability                                            | Guest                                                               | Space link pseudo-user                            |
|-------------------------------------------------------|---------------------------------------------------------------------|---------------------------------------------------|
| Access scope                                          | Spaces granted directly or through an allowed collaboration context | Only the space attached to the authenticated link |
| Read and download                                     | Yes                                                                 | Yes                                               |
| Create, upload, copy, or move content into a location | Requires `ADD`                                                      | Requires `ADD`                                    |
| Edit, rename, overwrite, or lock content              | Requires `MODIFY`                                                   | Requires `MODIFY`                                 |
| Delete content or move it out of a location           | Requires `DELETE`; a move also requires `ADD` on the destination    | Same                                              |
| Comments                                              | Yes, on accessible content                                          | Yes, on accessible content                        |
| Favorites                                             | Yes                                                                 | No                                                |
| WebDAV                                                | Yes                                                                 | No                                                |
| Personal space and personal trash                     | No                                                                  | No                                                |
| Collaborative-space trash                             | No                                                                  | No                                                |
| Personal-file anchoring                               | No                                                                  | No                                                |
| Create shares, share links, or child shares           | No                                                                  | No                                                |
| Manage a collaborative space or its shares            | No                                                                  | No                                                |
| Desktop synchronization                               | No                                                                  | No                                                |

Only administrators and regular users can be collaborative-space managers. Guests can be space members but cannot be promoted to manager, and link
pseudo-users are always link-scoped members. A manager of an originating collaborative space can administer the shares created from that space through
the space-management endpoints; this manager oversight is distinct from the global `SHARES_ADMIN` application permission.

`SHARE_INSIDE` and `SHARE_OUTSIDE` are not independently usable by guests or link pseudo-users. Anchoring requires a personal source that these roles
do not have, while share creation and child-share creation require an authorized regular user and the share-administration capability. Link settings
normally expose only `ADD`, `MODIFY`, and `DELETE`.

Collaborative-space trash is a recovery scope reserved for administrators and regular users. Guests and link pseudo-users can move active content to
the trash when their effective permissions include `DELETE`, but they cannot list, browse, restore, permanently delete, or empty the trash.

Link access remains subject to the link state and settings, including activation, expiration, access limits, and optional password authentication.
Link pseudo-users cannot use the normal login flow.

### Revocation and persisted state

Revoking an application permission prevents subsequent protected actions, but it does not delete relationships or configurations that were created
while the permission was granted. Existing space roots, shares, desktop clients, and synchronization paths therefore remain persisted until an
authorized actor explicitly changes or removes them.

File detail badges report that existing state independently from the current action permissions. A regular user can still see that one of their files
belongs to a space, is shared, or has a synchronization path after the corresponding permission is revoked. Queries must keep those details scoped to
resources owned by or otherwise visible to the authenticated user. Creating, updating, deleting, browsing, or executing the related resource remains
protected by its normal guards and context permissions. Guests and link pseudo-users do not load synchronization details because they cannot own
desktop synchronization clients.

## Homes and temporary files

Temporary working data for target-storage operations is stored with the targeted storage rather than with the authenticated actor. Downloadable task
archives are stored in the actor's home until their task is removed or expires, while avatar uploads are staged in the user or guest home.

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

`temporaryRootFromSpace` keeps working data on the same physical storage as its destination. Shared temporary roots stay flat; every managed entry
contains the actor identifier in its name:

| Destination context                                  | Temporary root                                           |
|------------------------------------------------------|----------------------------------------------------------|
| Actor's own personal space                           | `users/<actor-login>/tmp/`                               |
| Native collaborative space                           | `spaces/<space-alias>/tmp/`                               |
| External space root                                  | `<external-root>/.sync-in-tmp/`                           |
| Root or share backed by personal storage             | `users/<owner-login>/tmp/`                                |
| Share backed by a native collaborative space         | `spaces/<origin-space-alias>/tmp/`                        |
| Share backed by an external root                     | `<external-root>/.sync-in-tmp/`                           |

For example, if Alice with actor identifier `42` uploads into a root anchored in Bob's personal storage, staging uses an entry beginning with
`server-user-42-` directly under `users/bob/tmp/`. It remains on Bob's physical storage while its name identifies Alice as the acting user.

The resolver keeps every generated path inside the selected temporary root. Directories are created lazily when first needed.

External storage roots have no managed `tmp` directory, so they use the internal reserved `.sync-in-tmp` directory. It is never exposed through
filesystem browsing, search, content indexing, archives, recursive copies, or Sync diffs, even when hidden files are enabled. Direct requests
targeting this directory, including alternate letter casing on case-insensitive storage, are rejected. The reserved entry must be a real directory;
the server refuses a symbolic link in its place and the scheduler never follows one during cleanup.

Among target-storage operations, only those targeting the actor's own personal space use that actor's home `tmp` directory directly. Downloadable
task archives and avatar staging also use the account home because they are account-scoped exceptions. There is no additional `staging` directory.

### Temporary-file names

Every operation artifact follows the same naming convention:

```text
server-user-<actor-id>-<operation>-<execution-id>-<basename>
```

Desktop clients use their own flat namespace when a synchronized local root contains `.sync-in-tmp`:

```text
desktop-<client-id>-sync-path-<path-id>-<operation>-<transfer-id>[.<role>]
```

The server never creates, interprets, or removes entries from that namespace.

The components have the following meaning:

- `<operation>` is the underlying operation, such as `upload`, `download`,
  `compress`, `decompress`, `copy`, `move`, `delete`, or `avatar`;
- `<actor-id>` is the positive numeric identifier of the user performing the operation;
- `<execution-id>` is a generated UUID for a direct operation;
- `<execution-id>` is `task.id` for an operation executed as a task;
- `<basename>` is a sanitized basename, truncated when required by filesystem filename limits.

Examples:

```text
server-user-42-upload-550e8400-e29b-41d4-a716-446655440000-report.pdf
server-user-42-download-6c105f70-f5c4-49af-94b9-f341bbaa1047-video.mp4
server-user-42-compress-6c105f70-f5c4-49af-94b9-f341bbaa1047-photos.zip
server-user-42-decompress-6c105f70-f5c4-49af-94b9-f341bbaa1047-archive
server-user-42-avatar-550e8400-e29b-41d4-a716-446655440000-avatar.png
```

### Direct operation lifecycle

Direct operations create their working artifacts in the target temporary directory. This includes:

- staged HTTP and multipart overwrites;
- staged WebDAV overwrites;
- downloads from a URL;
- compression into the target directory;
- decompression;
- copy and move staging when an operation requires it;
- other intermediate files associated with a destination.

New files may write directly to their destination when the destination itself is the required checkpoint. When resumable chunking is enabled and a
client selects that protocol for a file, its payload and recovery metadata are persisted in an upload-session directory under the destination
storage's selected temporary root, then published after validation with the same move helper as multipart uploads. The desktop single-stream
compatibility route also stages its complete payload in the selected temporary root.

After validation, a standard operation artifact is moved to its final destination. It is removed when validation, publication, or an earlier
operation step fails. A resumable session instead remains after an ordinary transfer failure for possible recovery or scheduled cleanup.

Avatar updates are profile operations rather than target-storage operations. An avatar is prepared in the user or guest home `tmp` directory before
being published as `avatar.png` at the home root.

### Task artifact lifecycle

A task is the asynchronous execution of an existing operation. Task artifacts therefore use the operation naming convention with the task identifier:

```text
server-user-<actor-id>-<task.type>-<task.id>-<basename>
```

Task working artifacts remain with the target. For example:

```text
spaces/project/tmp/server-user-42-decompress-<task-id>-archive
<external-root>/.sync-in-tmp/server-user-42-copy-<task-id>-directory
```

All artifacts belonging to a task share the following prefix:

```text
server-user-<actor-id>-<task.type>-<task.id>-
```

### Downloadable task archives

A compression task with `compressInDirectory` set to `false` produces an archive for user download. Unlike other task artifacts, this archive is
created and kept in the actor's home:

```text
USER   -> users/<login>/tmp/server-user-<actor-id>-compress-<task-id>-photos.zip
GUEST  -> users/<login>/tmp/server-user-<actor-id>-compress-<task-id>-photos.zip
LINK   -> links/<link-user-id>/tmp/server-user-<actor-id>-compress-<task-id>-photos.zip
```

The physical filename is internal. `task.name` contains the logical filename presented to the user. The download response uses that logical name
explicitly:

```ts
new SendFile(archivePath, task.name)
```

For example, the physical file
`server-user-<actor-id>-compress-<task-id>-photos.zip` is downloaded as `photos.zip`.

### Cleanup

A standard operation removes its working artifact after successful publication or after an error. Consequently, completed copy, move, download,
compression, decompression, and resumable-upload operations do not retain working artifacts on their target storage. Explicit cancellation removes
an active upload session, while scheduled expiration handles abandoned sessions.

When a downloadable archive task is removed, the task manager removes its retained archive using the task ownership prefix:

```text
server-user-<actor-id>-<task.type>-<task.id>-
```

The scheduler scans user, guest, link, native-space, personal-storage, and registered external-storage temporary roots. It groups entries by their
strict `server-user-<actor-id>-` prefix and preserves prefixes owned by a task that is still cached. Expired server entries are removed; `desktop-*`
and unknown names are never touched. The scheduler acts as a recovery mechanism and does not replace normal operation or task cleanup.
