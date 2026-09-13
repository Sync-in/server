# Links

The `links` module exposes files, directories, shares, and collaborative spaces to external recipients through a unique public URL. A link is not a
direct permission bypass: it creates a dedicated `LINK` pseudo-user whose membership and permissions are resolved by the regular space, share, and
file services.

Link creation and administration are handled by the `shares` module because links are represented as members of a share or space. The `links`
module owns public-link validation, authentication, session issuance, direct file downloads, access counting, and public metadata resolution.

## Identity and persistence model

Every link consists of three related records:

```text
users (role = LINK)
  └── links (uuid and access settings)
        └── spaces_members or shares_members (target and permissions)
```

| Record           | Responsibility                                                                                        |
|------------------|-------------------------------------------------------------------------------------------------------|
| `users`          | Dedicated `LINK` identity, password hash, language, active state, access history, and login attempts. |
| `links`          | Public UUID, recipient metadata, authentication requirement, access counter, limit, and expiration.   |
| `spaces_members` | Membership and permissions for a link targeting an entire collaborative space.                        |
| `shares_members` | Membership and permissions for a link targeting a file, directory, or existing share.                 |

Each link has its own pseudo-user and membership. A `LINK` user cannot use the normal login flow and is excluded from user searches. Once a link
session has been issued, the pseudo-user accesses the target through the same authenticated file and space APIs as other identities, restricted by
its membership permissions.

The `links` table stores the following settings:

| Field         | Meaning                                                                                                       |
|---------------|---------------------------------------------------------------------------------------------------------------|
| `uuid`        | Unique 32-character base64url identifier used in the public URL.                                              |
| `userId`      | Dedicated `LINK` pseudo-user associated with the link.                                                        |
| `name`        | Recipient or display name.                                                                                    |
| `email`       | Optional recipient address used for notification.                                                             |
| `requireAuth` | Requires the link password before a session is issued.                                                        |
| `nbAccess`    | Number of accesses consumed, including for unlimited links.                                                   |
| `limitAccess` | Maximum number of accesses that may be consumed; `0` means unlimited.                                         |
| `expiresAt`   | Optional date after which public-link entry points reject the link; `null` means that the link never expires. |
| `createdAt`   | Link creation timestamp.                                                                                      |

The active state and password belong to the pseudo-user rather than to the `links` row. Disabling a link sets that user's `isActive` state to
`false`. Re-enabling it also resets its password-attempt counter.

## Link types and permissions

| Type              | Membership       | Exposed target                            | Direct download endpoint |
|-------------------|------------------|-------------------------------------------|--------------------------|
| `LINK_TYPE.SPACE` | `spaces_members` | Entire collaborative space                | Rejected                 |
| `LINK_TYPE.SHARE` | `shares_members` | Shared file, directory, or existing share | File only                |

The membership row is the permission boundary. A link can only browse, view, edit, add, delete, or download content when the target's normal
permission resolution allows that operation. Share-link permissions submitted through the management API are intersected with the permissions the
manager is allowed to delegate.

File links can be downloaded from the public endpoint or opened through the authenticated file interface. Directory and space links must first
obtain a link session and are then browsed through their normal repositories. Collaborative editors also operate through that authenticated session;
opening or saving a document does not consume another link access.

## Creation and management

The management flow is implemented by `SharesManager` and the authenticated `/api/app/shares/links` routes:

1. Generate a candidate UUID with `GET /api/app/shares/links/uuid`.
2. Reserve that UUID for the requesting user in cache for 15 minutes.
3. Submit the link with the parent share or space configuration.
4. Create a dedicated `LINK` pseudo-user with the appropriate `SHARES` or `SPACES` application permission.
5. Insert the `links` row and its `shares_members` or `spaces_members` relationship.
6. Send a recipient notification when an email address was provided.

Creation accepts only a UUID currently reserved for that user. The database unique index remains the final uniqueness constraint. If password
protection is not configured, the pseudo-user still receives an internal random password that is not exposed or used by the public flow.

Link settings can update recipient metadata, language, active state, password, permissions, access limit, expiration, and the linked share's name or
description where applicable. Changing a limit does not reset `nbAccess`.

Removing a link first removes its lazy `links/<link-user-id>/` home and then deletes the pseudo-user. Foreign-key cascades remove the associated link
and membership rows. If filesystem cleanup fails, the database record is preserved so deletion can be retried. Deleting a parent share or space also
removes its link members.

## Public request flow

Public routes use optional token authentication. A request without a valid access token receives the anonymous identity; a request carrying the
matching link-user token is treated as an existing link session.

| Route                                | Purpose                                                             | Consumes an access                |
|--------------------------------------|---------------------------------------------------------------------|-----------------------------------|
| `GET /api/app/link/validation/:uuid` | Validate the link and return the public target metadata.            | No                                |
| `GET /api/app/link/access/:uuid`     | Issue a link session or return the already authenticated link user. | Only for a new session            |
| `GET /api/app/link/download/:uuid`   | Download the file referenced by a file link.                        | Only without an existing session  |
| `POST /api/app/link/auth/:uuid`      | Validate the link password and issue a link session.                | After a successful password check |

Validation returns the linked space or share metadata only when every check succeeds. It includes the owner's display name and optional avatar but
removes the owner's login. File and directory metadata includes the enabled collaborative-editor providers required by the public page.

Every public operation applies these controls:

1. The UUID must resolve to a link and pseudo-user.
2. The pseudo-user must be active.
3. A new access must remain below `limitAccess` when the limit is non-zero.
4. The configured `expiresAt` date must not have been reached.
5. A protected link requires the matching link session, except while the authentication endpoint verifies its password.

The authentication endpoint uses the shared password-attempt protections. Failed passwords update the link user's access history and attempt counter;
successful authentication resets that state. The common authentication rate limit allows six requests per minute, while the download endpoint allows
30 requests per minute.

## Access counting

`limitAccess` counts newly granted access contexts rather than every operation performed through a link. The expected behavior is:

| Action                                                          | Counter increment |
|-----------------------------------------------------------------|-------------------|
| Validate a link                                                 | No                |
| Create a session for an unprotected link                        | Yes               |
| Authenticate successfully with a protected link                 | Yes               |
| Fail link password authentication                               | No                |
| Reopen the public page with the same link session               | No                |
| Download a file directly without a link session                 | Yes               |
| Download a file through an existing link session                | No                |
| Browse, view, edit, or save content through an existing session | No                |
| Refresh an existing link session                                | No                |

The limit is enforced by a single conditional database update:

```sql
UPDATE links
SET nbAccess = nbAccess + 1
WHERE uuid = ?
  AND (limitAccess = 0 OR nbAccess < limitAccess);
```

The request proceeds only when one row is updated. This makes the limit decision and counter increment atomic: concurrent requests cannot both
consume the same remaining slot. The operation is awaited before cookies or a file response are returned, and database errors fail closed.

Unlimited links still increment `nbAccess` for reporting. A direct download consumes its slot before the file checks and stream are completed, so a
later download failure can consume an access. This ordering deliberately prevents a response from being granted when access consumption fails.

Reaching the limit prevents new sessions and direct downloads without a session. It does not revoke a link session that has already consumed an
access.

## Session and expiration behavior

Link sessions use the standard authentication cookies. With the default configuration, the access token lasts 15 minutes and the refresh token has
a fixed four-hour lifetime. The normal login endpoint rejects `LINK` users, but the refresh endpoint accepts an existing valid link refresh token.
Token refresh does not consume another link access.

The public-link endpoints re-read the link and enforce `isActive`, `limitAccess`, and `expiresAt` on every call. Authenticated file, share, and space
operations use the issued token and membership; they do not re-read the `links` row. Consequently:

- reaching `limitAccess` does not interrupt an existing session;
- disabling the pseudo-user prevents new public access and token refresh, while an already-issued access token remains valid until its expiration;
- deleting the link removes its membership and prevents further target resolution;
- reaching `expiresAt` blocks the public-link entry points but does not itself revoke tokens already issued to the link user.

Any requirement for immediate session revocation or strict expiration during downstream file operations must therefore be enforced separately from
the current public-entry checks.

## Error and rate-limit responses

Public validation reports one of the link error states used by the web client:

| Error          | Meaning                                                                   |
|----------------|---------------------------------------------------------------------------|
| `not found`    | The UUID has no associated link.                                          |
| `disabled`     | The link pseudo-user is inactive.                                         |
| `exceeded`     | The access limit has been reached or the conditional consumption failed.  |
| `expired`      | The configured expiration date has been reached.                          |
| `unauthorized` | The link requires password authentication and no matching session exists. |

Validation returns the state in its response body so the frontend can select the appropriate public page. Access, download, and authentication
raise HTTP errors. Rate-limit violations return HTTP 429 independently of link validation and access counting.
