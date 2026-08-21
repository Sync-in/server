# OpenID Connect

Sync-in delegates authentication to one configured OpenID Connect (OIDC) identity provider. The provider is enabled when `auth.provider` is set to
`oidc`.

The current implementation supports:

- OIDC discovery from the configured issuer URL;
- the Authorization Code flow for a confidential client;
- `client_secret_basic` and `client_secret_post` token endpoint authentication;
- optional PKCE with the `S256` challenge method;
- profile retrieval from the UserInfo endpoint;
- web and desktop loopback callbacks;
- automatic local account creation and profile synchronization;
- role, storage quota, and avatar mapping;
- an optional local password flow alongside OIDC.

Only one IdP can be configured at a time. Sync-in creates its own local session after the OIDC callback and does not retain the IdP access, ID, or
refresh tokens.

## Authentication flow

1. The client opens `/api/auth/oidc/login`.
2. Sync-in discovers the provider metadata on first use and caches the resulting client configuration.
3. Sync-in generates `state` and `nonce` values. It also generates a PKCE verifier when PKCE is enabled and advertised by the provider.
4. The browser is redirected to the provider's authorization endpoint with `response_type=code` and the configured scopes.
5. The provider redirects the browser to the configured callback after authentication.
6. Sync-in validates `state`, `nonce`, and the PKCE verifier when applicable, then exchanges the authorization code at the token endpoint.
7. The ID token is validated and its `sub` claim is required. The access token is then used to retrieve the profile from the UserInfo endpoint.
8. Sync-in resolves, creates, or updates the local user and issues local Sync-in access and refresh cookies.

The temporary `state`, `nonce`, and PKCE verifier values are stored in HTTP-only, `SameSite=Lax` cookies for up to ten minutes. They are cleared after
the callback whether authentication succeeds or fails. The authorization redirect response also disables caching and referrer forwarding.

Discovery uses HTTPS by default and has a six-second timeout. Insecure HTTP can be enabled explicitly for development or a trusted legacy provider.

## Redirect URIs

The web callback is configured with `redirectUri` and is normally:

```text
https://sync-in.example.com/api/auth/oidc/callback
```

Desktop authentication uses one of these fixed loopback callbacks:

```text
http://127.0.0.1:49152/oidc/callback
http://127.0.0.1:49153/oidc/callback
http://127.0.0.1:49154/oidc/callback
```

Every callback used by a client must be registered as an allowed redirect URI at the IdP. A desktop client selects its loopback callback with the
`desktop_port` login parameter; any other port is rejected.

After a successful callback, the web flow redirects to the Sync-in frontend with an `oidc=true` marker and the local token expiration timestamps in
the URL fragment. Authentication tokens remain in the Sync-in cookies and are not placed in that URL.

## ID token and UserInfo responsibilities

Sync-in intentionally uses the two responses for different purposes:

- the validated ID token supplies the stable external identity (`sub`);
- the UserInfo response supplies the local profile attributes.

By default, the UserInfo `sub` must match the ID token `sub`. `security.skipSubjectCheck` disables this comparison only for non-compliant providers;
the ID token `sub` remains the identity stored by Sync-in, and a `sub` is still required in both responses.

The ID token issuer is validated against the discovered provider as part of OIDC validation, but Sync-in does not persist `iss` in the user record.
This is appropriate for the current single-IdP model; it is not an issuer-and-subject binding suitable for multiple simultaneous providers.

## Supported claims

Unless specified otherwise, claims in this table are read from the UserInfo response.

| Claim                        | Required   | Usage                                                                             |
|------------------------------|------------|-----------------------------------------------------------------------------------|
| ID token `sub`               | Yes        | Stored unchanged as the local `externalId`.                                       |
| UserInfo `sub`               | Yes        | Checked against the ID token subject unless `skipSubjectCheck` is enabled.        |
| `email`                      | Yes        | Trimmed, used for legacy account linking, and synchronized to the local profile.  |
| `email_verified`             | By default | Must be the boolean `true` when `requireVerifiedEmail` is enabled.                |
| `preferred_username`         | No         | Supplies the trimmed and lowercased base for a new local login.                   |
| `given_name` / `family_name` | No         | Synchronize the local first and last names.                                       |
| `name`                       | No         | Split into first and last names only when both structured name claims are absent. |
| `groups` / `roles`           | No         | Top-level arrays inspected for an exact `adminRoleOrGroup` match.                 |
| `picture`                    | No         | HTTP(S) avatar URL used when automatic avatar synchronization is enabled.         |
| Configured quota claim       | No         | Synchronizes the local storage quota in bytes.                                    |

If `preferred_username` is absent, the email local-part initializes the login. Because email is required, the UserInfo `sub` is not normally used as
the login fallback.

Claims available only in an ID token are not merged into the UserInfo profile. Provider-specific mappers must expose roles, groups, quota, and other
profile attributes through the UserInfo endpoint when those mappings are required.

## Identity binding and backward compatibility

The validated ID token `sub` is the stable external identity. Sync-in stores it unchanged in the nullable, unique `users.externalId` column.

At login, accounts are resolved in this order:

1. Match `externalId` against the ID token `sub`.
2. Fall back to the OIDC email only for an existing account whose `externalId` is still empty.
3. Atomically persist the unchanged `sub` on that account so later logins no longer depend on its email.
4. Create a new local account when no match exists and `autoCreateUser` is enabled.

The email fallback is the compatibility path for accounts that authenticated through OIDC before external identities were stored. It never matches a
local login. An email match is rejected when that local account is already linked to a different external identity.

Once linked, a user continues to be found by `externalId` if their IdP email changes. The new email can then be synchronized to the local profile.
Conversely, a legacy account whose email changed before its first external-ID binding cannot be located through the old email automatically.

The issuer is not stored because Sync-in supports a single configured IdP. Changing `issuerUrl` therefore requires an explicit migration or reset of
existing `externalId` values before users authenticate against the replacement provider.

## Account creation and profile synchronization

When `autoCreateUser` is enabled, a first successful login creates a local user with:

- the normalized `preferred_username`, or the email local-part, as the base `login`;
- the required OIDC email;
- the mapped first and last names;
- the unchanged ID token `sub` as `externalId`;
- the configured creation-time permissions;
- the mapped administrator role and storage quota, when present;
- an internal random password required by the local user model but not used for OIDC authentication.

When automatic creation is disabled, authentication succeeds only for an already linked account or a compatible existing account found by email.

For an existing user, each successful OIDC login can synchronize:

- email;
- first and last names;
- administrator or regular-user role;
- storage quota, when the configured claim is present and valid;
- avatar, when enabled.

The local `login`, password, and permissions are not synchronized. In particular, `preferred_username` initializes the login but does not rename it on
later authentications.

OIDC does not guarantee that `preferred_username` is unique or stable. When the derived base login is already used, Sync-in appends a deterministic
lowercase hexadecimal SHA-256 suffix derived from the validated ID token `sub`; the raw subject is not exposed in the login. The base is truncated
when necessary to keep the generated login within 255 characters. The database unique index remains the final authority for the generated login.

Profile update failures are logged without invalidating an otherwise successful OIDC authentication. Creation-time permissions are never reapplied to
an existing user.

## Administrator role mapping

When `options.adminRoleOrGroup` is configured, Sync-in searches the top-level UserInfo `groups` and `roles` arrays for that exact value. Matching is
case-sensitive.

- A match assigns the administrator role.
- No match assigns the regular-user role, including demotion of a previously mapped administrator.
- When no mapping is configured, existing local administrators keep their role and OIDC profile synchronization cannot demote them.

Nested or provider-specific role structures are not interpreted. They must be mapped by the IdP to a supported top-level array.

## Storage quota mapping

`options.storageQuotaClaim` selects the UserInfo claim containing the quota in bytes. Its default name is `storageQuota`.

- A non-negative safe integer or a decimal integer string is accepted.
- `null` or `0` sets the local quota to `null`, meaning unlimited storage.
- A missing claim leaves the current local quota unchanged.
- A negative, fractional, non-numeric, or unsafe value is ignored.

## Avatar synchronization

When `options.autoSyncAvatar` is enabled, Sync-in reads the UserInfo `picture` URL after a successful login. The URL must use HTTP or HTTPS.

Before installing the avatar, Sync-in checks the content type and enforces a 5 MiB maximum. The image is downloaded to a temporary location, converted
to PNG, and stored as the local user avatar. Source URL, size, and last-modified metadata are retained so an unchanged remote avatar can be skipped on
subsequent logins.

Downloads from private or internal IP ranges are blocked by default to limit server-side request forgery exposure.
`security.allowPrivateIpAvatarDownload` should be enabled only when the IdP returns trusted internal URLs.

## Local password authentication and MFA

OIDC login trusts the authentication policy enforced by the identity provider. Sync-in does not add its local TOTP challenge after a successful OIDC
callback. Administrators should enforce MFA, when needed, in the IdP policy assigned to the Sync-in client or application.

A successful IdP authentication does not override local account access: an existing user disabled in Sync-in is rejected before external identity
binding or profile synchronization.

Sync-in TOTP still applies to interactive local password authentication. With the OIDC provider selected, local passwords are accepted for:

- guest users;
- administrators as break-glass access;
- scoped application or app-password authentication;
- regular users when `options.enablePasswordAuth` is enabled.

Administrator accounts should have a local Sync-in password configured and kept available so they can use break-glass access if the identity provider
is unavailable or misconfigured.

Scoped application authentication is non-interactive and does not invoke a TOTP challenge.

### App passwords

App passwords remain local Sync-in secrets used for scoped application authentication, such as WebDAV or client access. They are not OIDC tokens and
they are not synchronized with the identity provider.

For self-service generation or revocation, regular users do not need to pass a Sync-in step-up challenge when their current browser session was
created through OIDC. The OIDC provider is expected to enforce the primary authentication and MFA policy before issuing the Sync-in browser session.

This exception does not apply to administrators or to local password sessions, including regular users who authenticate locally when
`options.enablePasswordAuth` is enabled. Those sessions must still pass the usual Sync-in step-up before app passwords can be generated or revoked.

The Sync-in logout endpoint clears only the local session cookies. It does not currently call the IdP end-session or token revocation endpoints, so an
existing IdP SSO session can authenticate the browser again without prompting for credentials.

## Configuration reference

### Client settings

| Setting        | Default  | Description                                  |
|----------------|----------|----------------------------------------------|
| `issuerUrl`    | Required | Provider issuer URL used for discovery.      |
| `clientId`     | Required | OIDC client identifier.                      |
| `clientSecret` | Required | OIDC confidential-client secret.             |
| `redirectUri`  | Required | Web callback URI registered at the provider. |

### Functional options

| Setting                         | Default                        | Description                                                        |
|---------------------------------|--------------------------------|--------------------------------------------------------------------|
| `options.autoCreateUser`        | `true`                         | Create a local account when no compatible user exists.             |
| `options.autoCreatePermissions` | `[]`                           | Permissions assigned only when automatically creating an account.  |
| `options.autoRedirect`          | `false`                        | Tell the login UI to start OIDC automatically.                     |
| `options.enablePasswordAuth`    | `false`                        | Permit regular users to use their local password alongside OIDC.   |
| `options.autoSyncAvatar`        | `false`                        | Synchronize the UserInfo `picture` at login.                       |
| `options.adminRoleOrGroup`      | Unset                          | Exact top-level role or group value granting administrator access. |
| `options.storageQuotaClaim`     | `storageQuota`                 | UserInfo claim containing the quota in bytes.                      |
| `options.buttonText`            | `Continue with OpenID Connect` | Label exposed to the login UI.                                     |

### Security options

| Setting                                 | Default                | Description                                                                            |
|-----------------------------------------|------------------------|----------------------------------------------------------------------------------------|
| `security.scope`                        | `openid email profile` | Space-separated scopes; `openid` is mandatory.                                         |
| `security.supportPKCE`                  | `true`                 | Use PKCE S256 when the provider metadata advertises support.                           |
| `security.allowInsecureRequests`        | `false`                | Permit HTTP discovery and OIDC requests. Intended only for controlled environments.    |
| `security.tokenEndpointAuthMethod`      | `client_secret_basic`  | Token endpoint authentication; supports `client_secret_basic` or `client_secret_post`. |
| `security.tokenSigningAlg`              | `RS256`                | Expected ID token signing algorithm.                                                   |
| `security.userInfoSigningAlg`           | Unset                  | Request and validate a signed UserInfo response with the configured algorithm.         |
| `security.skipSubjectCheck`             | `false`                | Skip the UserInfo-to-ID-token subject comparison for a legacy provider.                |
| `security.requireVerifiedEmail`         | `true`                 | Require UserInfo `email_verified` to be exactly `true`.                                |
| `security.allowPrivateIpAvatarDownload` | `false`                | Permit avatar URLs resolving to private or internal addresses.                         |

## Current boundaries

- A UserInfo endpoint is required; profile claims are not taken from the ID token.
- Only one IdP and one global OIDC client configuration are supported.
- External identities are keyed by the ID token `sub` as received, not by an `(iss, sub)` pair.
- Public clients without a client secret are not exposed by the current validated configuration.
- IdP tokens are not retained or refreshed; Sync-in issues and refreshes its own local tokens.
- RP-initiated logout, front-channel logout, back-channel logout, and IdP token revocation are not implemented.
- Login renaming is not implemented; the login assigned during OIDC account creation remains stable.
