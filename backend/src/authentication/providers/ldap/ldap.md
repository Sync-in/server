# LDAP

Sync-in authenticates regular users against one configured LDAP directory when `auth.provider` is set to `ldap`.

The current implementation supports:

- multiple LDAP or LDAPS server URLs, tried in order for service failures;
- Node.js TLS options, including CA values loaded from files or provided inline;
- generic LDAP bind by constructed user DN;
- optional service-account bind for user and group searches, followed by user bind for password validation;
- Active Directory login helpers for `userPrincipalName` and `sAMAccountName`;
- user lookup by login, common name, or email, with an optional trusted extra filter;
- automatic local account creation and profile synchronization;
- administrator role mapping from `memberOf` or `groupOfNames`;
- storage quota mapping from a configured LDAP attribute;
- controlled local password fallback for guests, application scopes, administrators, and configured LDAP service-outage cases.

Only one LDAP configuration can be active at a time. Sync-in creates and authorizes its own local user session after LDAP authentication succeeds. It
does not store the LDAP server, bind DN, or any LDAP token in the user record.

## Authentication flow

1. The client submits a login or email and password through the normal Sync-in password flow.
2. Sync-in looks for an existing local user by login or email after normalizing `DOMAIN\user` input to `user`.
3. Existing guest users and existing scoped application authentications use local password or app-password validation and do not bind to LDAP.
4. Existing disabled users are rejected before LDAP authentication.
5. Sync-in builds the LDAP login from the submitted or stored local login.
6. Sync-in binds to LDAP, searches the user entry, validates the required attributes, and maps the LDAP profile to a local identity.
7. Sync-in creates a new local user when `options.autoCreateUser` is enabled, or updates the matching existing user.
8. The regular Sync-in authentication layer then issues local tokens or starts the local TOTP step when TOTP is required.

LDAP is part of the local credential flow. Unlike OIDC, Sync-in TOTP can still be required after the LDAP password step for browser and bearer-token
authentication.

## Bind modes

Without a service account, Sync-in binds directly as the user.

For generic LDAP, the bind DN is constructed as:

```text
<attributes.login>=<login>,<baseDN>
```

For Active Directory login attributes, Sync-in binds with the login string directly instead of constructing a DN:

- `userPrincipalName` can append `upnSuffix` when the user enters `john` instead of `john@example.com`;
- `sAMAccountName` can prepend `netbiosName` when the user enters `john` instead of `DOMAIN\john`.

When `serviceBindDN` and `serviceBindPassword` are configured, Sync-in first binds as the service account, searches the user entry and its DN, then
binds as that user DN with the submitted password. This mode is required when user DNs cannot be constructed from `attributes.login` and `baseDN`, or
when users cannot read the attributes and groups needed by Sync-in.

Multiple servers are attempted for connection, DNS, timeout, and similar service errors. Invalid credentials, a successful search with no matching
entry, or a successful search that returns an unusable entry ends the authentication attempt instead of falling through to another server.

LDAP client connections use a six-second operation timeout and a six-second connect timeout.

Sync-in rejects zero-length user passwords before opening an LDAP connection. Directory operators must also disable unauthenticated simple binds
(a non-empty bind DN with an empty password) and anonymous binds in the LDAP server policy; the application-side check is defense in depth, not a
replacement for that server-side restriction.

## User search

User searches run under `baseDN` with subtree scope. Sync-in asks LDAP for the known login attributes, common profile attributes, the configured email
attribute, and the configured storage quota attribute.

For Active Directory mode, the search filter matches any of:

```text
sAMAccountName
userPrincipalName
mail
```

For generic LDAP mode, the search filter matches any of:

```text
uid
cn
mail
```

The login value placed in these comparisons is escaped by `ldapts`. The configured `filter` is then appended as-is and is treated as trusted
administrator configuration, not user input.

If multiple entries match, Sync-in logs a warning and uses the first entry returned by LDAP.

## Supported attributes

| Attribute                            | Required         | Usage                                                                                           |
|--------------------------------------|------------------|-------------------------------------------------------------------------------------------------|
| Configured `attributes.login`        | Yes              | Supplies the local Sync-in `login` and must match the existing local login on updates.          |
| Configured `attributes.email`        | Yes              | Supplies and synchronizes the local email address.                                              |
| `givenName` / `sn`                   | No               | Preferred first and last name source.                                                           |
| `displayName`                        | No               | Split into first and last names when structured name attributes are absent.                     |
| `cn`                                 | No               | Used as the final name fallback and as one of the generic LDAP search attributes.               |
| `memberOf`                           | No               | Used for administrator role mapping. Full DNs and extracted CN values are both considered.      |
| Entry DN                             | For service bind | Used to bind as the user after a service-account search and to check `groupOfNames` membership. |
| Configured `attributes.storageQuota` | No               | Synchronizes the local storage quota in bytes.                                                  |

Array-valued attributes are normalized before mapping. For `memberOf`, Sync-in keeps both the original string and the extracted `CN` value. For other
attributes, only the first value is used.

## Identity binding and local accounts

LDAP users are matched to local users by the submitted local login or email, not by a persisted LDAP external identifier. Sync-in does not populate
`users.externalId` for LDAP authentication.

When an existing local user is found, Sync-in authenticates against LDAP with that user's stored login. This allows a user to enter their email while
still binding with the local login. After LDAP returns an entry, the mapped LDAP login must equal the local user login; otherwise authentication is
rejected with an account matching error.

When no local user exists and `options.autoCreateUser` is disabled, LDAP authentication is rejected even if the LDAP bind succeeds.

Changing `attributes.login`, LDAP login values, or the directory layout can therefore require an explicit local account migration. LDAP does not have
the OIDC-style external subject binding that lets a renamed upstream identity continue to resolve automatically.

## Account creation and profile synchronization

When `autoCreateUser` is enabled, a first successful LDAP authentication creates a local user with:

- the normalized configured LDAP login attribute as the local `login`;
- the configured LDAP email attribute;
- the mapped first and last names;
- the mapped administrator or regular-user role;
- the mapped storage quota, when present and valid;
- the configured creation-time permissions;
- a local password hash derived from the submitted LDAP password.

For an existing user, each successful LDAP authentication can synchronize:

- email;
- first and last names;
- administrator or regular-user role;
- storage quota, when the configured attribute is present and valid;
- local password hash, when the submitted LDAP password differs from the stored local password.

The local `login` and permissions are not synchronized after creation. Creation-time permissions are never reapplied to an existing user.

Profile update failures are logged without invalidating an otherwise successful LDAP authentication.

## Administrator role mapping

When `options.adminGroup` is configured, Sync-in grants the administrator role when LDAP membership contains that group. The setting accepts either a
simple CN, such as:

```text
Admins
```

or a full DN, such as:

```text
CN=Admins,OU=Groups,DC=example,DC=org
```

`memberOf` values are normalized so either the full DN or its extracted CN can match. Matching is exact and case-sensitive after normalization.

If the user entry does not expose `memberOf`, Sync-in can also search `groupOfNames` groups for a `member` value equal to the user's DN. When
`adminGroup` is a full DN, that lookup uses base scope at the group DN. When `adminGroup` is a simple CN, it searches under `baseDN`.

- A match assigns the administrator role.
- No match assigns the regular-user role, including demotion of a previously mapped administrator.
- When no mapping is configured, existing local administrators keep their role and LDAP profile synchronization cannot demote them.

Use a service bind account when regular users cannot read the group attributes required for administrator mapping.

## Storage quota mapping

`attributes.storageQuota` selects the LDAP attribute containing the quota in bytes. Its default name is `storageQuota`.

- A non-negative safe integer or a decimal integer string is accepted.
- `null` or `0` sets the local quota to `null`, meaning unlimited storage.
- A missing attribute leaves the current local quota unchanged.
- A negative, fractional, non-numeric, or unsafe value is ignored.

## Local password authentication and MFA

LDAP authentication uses the normal Sync-in password endpoints. Sync-in TOTP still applies to interactive browser login, bearer-token login, and
client registration according to the shared authentication rules.

Local password authentication is used for:

- guest users;
- scoped application or app-password authentication for existing local users;
- administrators as break-glass access when LDAP authentication fails;
- regular users when LDAP is unavailable and `options.enablePasswordAuthFallback` is enabled.

Regular-user fallback applies only to LDAP service errors such as connection, DNS, or timeout failures after all configured servers fail. Invalid LDAP
credentials do not enable regular-user local password fallback.

Administrator fallback is always allowed as break-glass access when LDAP authentication fails. Administrator accounts should have a local Sync-in
password configured and kept available.

The local password hash is refreshed from the submitted LDAP password after successful LDAP authentication. If the LDAP password changes upstream,
local fallback can use the new password only after a successful LDAP login has synchronized it.

### App passwords

App passwords remain local Sync-in secrets used for scoped application authentication, such as WebDAV or client access. They are not LDAP passwords
and they are not synchronized with the directory.

For an existing local user and scoped authentication request, Sync-in validates the local password or app password locally and does not contact LDAP.
The WebDAV and TOTP restrictions from the shared authentication module still apply.

## TLS and CA handling

`tlsOptions` is passed to the underlying LDAP client as Node.js TLS options. It can contain standard options such as `rejectUnauthorized` and `ca`.

`tlsOptions.ca` accepts inline PEM content, buffers, arrays, or readable file paths. Readable file paths are loaded once while the provider builds its
client options. If a string path is not readable, Sync-in treats the value as inline CA content and logs a warning.

Use `ldaps://` server URLs when the directory should be contacted over LDAP over TLS.

## Configuration reference

### Connection settings

| Setting               | Default  | Description                                                              |
|-----------------------|----------|--------------------------------------------------------------------------|
| `servers`             | Required | LDAP or LDAPS server URL array.                                          |
| `tlsOptions`          | Unset    | Node.js TLS options passed to LDAP connections.                          |
| `baseDN`              | Required | Search base for users, and for group searches when `adminGroup` is a CN. |
| `filter`              | Unset    | Extra LDAP filter appended as trusted static configuration.              |
| `serviceBindDN`       | Unset    | Service-account DN used for user and group searches.                     |
| `serviceBindPassword` | Unset    | Service-account password.                                                |
| `upnSuffix`           | Unset    | Domain suffix appended for `userPrincipalName` logins without `@`.       |
| `netbiosName`         | Unset    | NetBIOS domain prepended for `sAMAccountName` logins without `DOMAIN\`.  |

### Attribute settings

| Setting                   | Default        | Description                                                                                                      |
|---------------------------|----------------|------------------------------------------------------------------------------------------------------------------|
| `attributes.login`        | `uid`          | LDAP attribute used as the local login. Supports `uid`, `cn`, `mail`, `sAMAccountName`, and `userPrincipalName`. |
| `attributes.email`        | `mail`         | LDAP attribute used as the local email address.                                                                  |
| `attributes.storageQuota` | `storageQuota` | LDAP attribute containing the quota in bytes.                                                                    |

### Functional options

| Setting                              | Default | Description                                                                               |
|--------------------------------------|---------|-------------------------------------------------------------------------------------------|
| `options.autoCreateUser`             | `true`  | Create a local account when no compatible user exists.                                    |
| `options.autoCreatePermissions`      | `[]`    | Permissions assigned only when automatically creating an account.                         |
| `options.adminGroup`                 | Unset   | Exact group CN or DN granting administrator access.                                       |
| `options.enablePasswordAuthFallback` | `false` | Permit regular users to use local password fallback when the LDAP service is unavailable. |

## Current boundaries

- Only one global LDAP configuration is supported.
- LDAP identities are not stored in `users.externalId`; account matching depends on local login or email.
- The first LDAP search result is used when multiple entries match.
- `filter` is appended as-is and must remain trusted administrator-controlled configuration.
- Generic LDAP direct bind assumes user DNs can be constructed as `<loginAttribute>=<login>,<baseDN>`; use service bind for other layouts.
- LDAP group membership is used only for administrator role mapping, not for importing or synchronizing Sync-in groups.
- LDAP avatar synchronization is not implemented.
- Password changes made in LDAP are synchronized to the local fallback password only after a successful LDAP authentication.
