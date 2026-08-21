# Authentication

The `authentication` module owns local sessions, API tokens, HTTP Basic authentication for WebDAV, configured authentication providers, and Sync-in
TOTP verification.

Sync-in supports three authentication providers:

| Provider       | Value   | Responsibility                                                                                                                                         |
|----------------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| MySQL          | `mysql` | Authenticate local users against the password stored in the Sync-in database.                                                                          |
| LDAP           | `ldap`  | Authenticate regular users against LDAP, with controlled local fallback for guests, administrators, application scopes, and configured fallback cases. |
| OpenID Connect | `oidc`  | Delegate browser authentication to one OIDC provider, then issue local Sync-in cookies. See `providers/oidc/oidc.md` for the detailed OIDC contract.   |

Regardless of provider, Sync-in authorizes requests with local user records, roles, permissions, and locally issued tokens after authentication
succeeds.

Link pseudo-users are excluded from normal authentication lookups. They can only authenticate through the public link flow, using the link UUID and
optional link password.

## Browser session flow

The browser login endpoint is:

```text
POST /api/auth/login
```

It uses local credential validation through the configured provider. When Sync-in TOTP is disabled globally or the user has no TOTP secret, a
successful login creates the final session cookies directly.

When TOTP is enabled globally and the user has a TOTP secret, the password step does not create a final session. It creates a temporary 2FA session
instead:

```text
sync-in-access  -> tokenType access_2fa, path /api/auth/2fa/login/verify
sync-in-csrf    -> temporary CSRF value
```

The client then posts the verification code to:

```text
POST /api/auth/2fa/login/verify
```

After a valid TOTP or recovery code, Sync-in clears the temporary 2FA access cookie and issues the final cookies.

## Cookies and tokens

Final browser sessions use four cookie types:

| Token     | Default cookie    | Path                | Purpose                                                             |
|-----------|-------------------|---------------------|---------------------------------------------------------------------|
| `access`  | `sync-in-access`  | `/`                 | Short-lived JWT used for normal authenticated HTTP requests.        |
| `refresh` | `sync-in-refresh` | `/api/auth/refresh` | Longer-lived JWT used to renew browser cookies.                     |
| `ws`      | `sync-in-ws`      | `/socket.io`        | JWT dedicated to websocket authentication.                          |
| `csrf`    | `sync-in-csrf`    | `/`                 | Signed CSRF token paired with the access or refresh JWT CSRF claim. |

Access, refresh, websocket, and temporary 2FA tokens are HTTP-only cookies. CSRF cookies are intentionally readable by the client so the signed value
can be echoed in the `sync-in-csrf` request header.

Cookie-backed unsafe requests validate CSRF only when the matching access, refresh, or temporary 2FA token came from cookies. Safe methods skip CSRF
validation. Bearer-token requests are not tied to the CSRF cookie.

`POST /api/auth/refresh` rotates the browser access, refresh, websocket, and CSRF cookies while preserving the remaining refresh-token lifetime.
`POST /api/auth/logout` clears all known authentication cookies on their configured paths.

## API token flow

Non-browser clients can request bearer tokens from:

```text
POST /api/auth/token
POST /api/auth/token/refresh
```

`POST /api/auth/token` uses the same password provider as browser login. If Sync-in TOTP is enabled for the user, the request must also pass the TOTP
verification guard with the `sync-in-two-fa-code` header. The password was already validated by the local guard, so this route does not require the
`sync-in-two-fa-password` header.

`POST /api/auth/token/refresh` accepts a valid refresh token and returns a new access token plus a refresh token whose expiration is capped by the
remaining lifetime of the original refresh token.

## TOTP lifecycle

TOTP is controlled by `auth.mfa.totp.enabled`. The default is enabled. A user is considered TOTP-enabled when their secrets contain `twoFaSecret`.

Initialization:

1. `GET /api/auth/2fa/enable` generates a secret and QR code for the current user.
2. The pending secret is cached for five minutes and encrypted when `auth.encryptionKey` is configured.
3. `POST /api/auth/2fa/enable` verifies the user's password and TOTP code before persisting the secret.
4. Enabling TOTP generates five single-use recovery codes.

Disabling TOTP requires the current password plus a valid TOTP or recovery code. Administrator reset of another user's TOTP requires administrator
role and the administrator's own 2FA verification guard.

TOTP codes are six digits. Verification accepts the current time window with a drift of one window. Recovery codes are stored in user secrets,
encrypted when `auth.encryptionKey` is configured, and consumed transactionally; a used recovery code cannot be reused.

Sensitive routes that use the shared 2FA verification guard read these headers:

```text
sync-in-two-fa-password
sync-in-two-fa-code
```

Routes can choose whether the password is always required, never required, or used only as a fallback when TOTP is not enabled.

## Application scopes

Some authentication flows are non-interactive and pass an `AUTH_SCOPE` to the configured provider:

| Scope    | Used by                                         | TOTP handling                                                                                                                             |
|----------|-------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `client` | Desktop, CLI, and sync-core client registration | The account password can authenticate the first registration, then a TOTP or recovery code is required when TOTP is enabled for the user. |
| `webdav` | HTTP Basic authentication on WebDAV routes      | TOTP cannot be challenged interactively; see the WebDAV rule below.                                                                       |

Scoped authentication can validate app passwords stored in user secrets. App passwords are scoped to one application and do not grant access to other
scopes.

### App passwords

Generating and revoking app passwords are self-service actions protected by the usual Sync-in step-up: TOTP when enabled, otherwise local password
confirmation.

### WebDAV and TOTP

WebDAV uses HTTP Basic authentication and cannot complete the interactive Sync-in TOTP challenge. For that reason, the WebDAV password rule is:

- if Sync-in TOTP is disabled globally or the user has no TOTP secret, WebDAV accepts the primary account password or a valid WebDAV app password;
- if Sync-in TOTP is enabled globally and the user has a TOTP secret, WebDAV does not accept the primary account password;
- in that 2FA case, WebDAV accepts only a valid app password with `app: webdav`.

The primary password comparison is still executed for scoped-auth timing, but a successful primary-password match is ignored for 2FA-protected WebDAV.

Revoking a WebDAV app password clears cached WebDAV Basic-auth results for that user so the revoked password cannot continue to authenticate from
cache.

### Client registration

The desktop and CLI client registration flow uses `AUTH_SCOPE.CLIENT`:

1. The client sends login, password, client identifier, and client information.
2. The configured provider validates the account password under the `client` scope.
3. If TOTP is enabled for the user, the registration must also include a valid TOTP or recovery code.
4. Sync-in creates or reuses the registered client and returns a client token.

Client tokens are long-lived registration credentials, not user passwords. Their default lifetime is `120d`; a token is renewed when it has less than
`60d` remaining. Authenticated clients can ask Sync-in to issue either browser cookies or bearer tokens for the registered owner.

## Provider-specific notes

MySQL delegates password checks directly to the local user manager.

LDAP authenticates regular users against LDAP. Local password authentication is still used for guest users and application scopes. Administrators can
use local password fallback as break-glass access when LDAP authentication fails according to the configured fallback rules. Administrator accounts
should therefore have a local Sync-in password configured and kept available for break-glass recovery.

OIDC browser login delegates the primary authentication and MFA policy to the identity provider. Sync-in does not add its local TOTP challenge after a
successful OIDC callback. Local password paths can still exist with OIDC selected for guests, administrators, scoped application authentication, and
regular users when explicitly enabled. OIDC-created users can set a known local password from their profile while authenticated through OIDC, for
local password access or password-fallback step-up. Users authenticated through OIDC can also configure Sync-in TOTP from their profile; enable,
reset, and disable flows still verify the local Sync-in password. Administrator accounts should have a local Sync-in password configured and kept
available for break-glass recovery. See `providers/oidc/oidc.md`.

## Access updates and password attempts

Authentication success and failure update the user's access metadata asynchronously. Failed password or code checks increment password attempts. A
successful password step for a TOTP-enabled user preserves password attempts until the TOTP verification step succeeds; the final 2FA success resets
the attempt counter.

Accounts that are inactive or have reached the maximum password attempts are rejected before password or app-password validation.
