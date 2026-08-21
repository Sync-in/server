# Two-Factor Authentication

Sync-in provides local two-factor authentication (2FA) through TOTP. This module is not selected by `auth.provider`; it is a shared step-up layer used
by local password authentication, LDAP authentication, selected account-management routes, administrator actions, API token issuance, and client
registration.

The current implementation supports:

- six-digit TOTP codes;
- QR-code setup from an `otpauth://` URL;
- pending setup secrets cached for five minutes;
- optional encryption of stored TOTP secrets and recovery codes with `auth.encryptionKey`;
- five single-use recovery codes generated when TOTP is enabled;
- browser login verification through a temporary 2FA cookie;
- bearer-token issuance with TOTP verification through a request header;
- current-password confirmation for enable, disable, and selected step-up routes;
- administrator reset of another user's TOTP after administrator step-up verification;
- local-password fallback for routes that require a step-up when the user has no active TOTP secret.

TOTP is controlled globally by `auth.mfa.totp.enabled`, which defaults to `true`. A user is considered TOTP-enabled when their stored secrets contain
`twoFaSecret`.

## Browser login flow

1. The client posts credentials to `/api/auth/login`.
2. The configured password provider validates the login and password.
3. If global TOTP is disabled or the user has no `twoFaSecret`, Sync-in issues the final local session cookies immediately.
4. If TOTP is required, Sync-in issues only temporary 2FA cookies and returns a response whose user payload contains `twoFaEnabled: true`.
5. The client posts a TOTP code or recovery code to `/api/auth/2fa/login/verify`.
6. Sync-in validates the temporary 2FA access cookie, CSRF header, account access, and verification code.
7. On success, Sync-in issues the final local session cookies and clears the temporary 2FA access cookie.

The temporary access cookie uses the same cookie name as the regular access cookie, but is scoped to `/api/auth/2fa/login/verify` and has token type
`access_2fa`. The temporary CSRF cookie uses the normal CSRF cookie name and is replaced by the final CSRF cookie after successful verification.

Temporary 2FA cookies expire after five minutes. The temporary JWT intentionally contains only the minimum identity data required to finish login:
user ID, login, language, role, and `twoFaEnabled: true`.

## Setup flow

TOTP setup starts with:

```text
GET /api/auth/2fa/enable
```

The route is authenticated and limited to regular users. It returns:

| Field       | Description                                                   |
|-------------|---------------------------------------------------------------|
| `secret`    | TOTP secret shown to the user for manual authenticator setup. |
| `qrDataUrl` | QR code data URL generated from the TOTP setup URL.           |

Sync-in stores the pending setup secret in cache for five minutes. The response disables caching with `Cache-Control: no-store`.

Users whose browser session was created through OIDC can open this setup flow from their profile. The final enable or reset request still verifies the
current local Sync-in password; OIDC-created users must set a known local password first.

The user completes setup with:

```text
POST /api/auth/2fa/enable
```

Body:

| Field            | Required | Description                                                             |
|------------------|----------|-------------------------------------------------------------------------|
| `password`       | Yes      | Current local Sync-in password.                                         |
| `code`           | Yes      | TOTP code generated from the pending secret.                            |
| `isRecoveryCode` | No       | Shared verification flag; setup is normally completed with a TOTP code. |

When the password and code are valid, Sync-in stores the TOTP secret in user secrets, generates five recovery codes, removes the pending cache entry,
and sends an email notification when mail notifications are available. Recovery codes are returned only in this enable response.

If the pending secret has expired, setup fails and the user must start again with `GET /api/auth/2fa/enable`.

## Disable flow

TOTP is disabled with:

```text
POST /api/auth/2fa/disable
```

Body:

| Field            | Required | Description                                   |
|------------------|----------|-----------------------------------------------|
| `password`       | Yes      | Current local Sync-in password.               |
| `code`           | Yes      | TOTP code or recovery code.                   |
| `isRecoveryCode` | No       | Set to `true` when `code` is a recovery code. |

On success, Sync-in removes both `twoFaSecret` and `recoveryCodes` from user secrets and sends an email notification when mail notifications are
available.

## Recovery codes

Enabling TOTP generates five recovery codes. They are stored in user secrets after applying the same secret encryption rule as the TOTP secret.

Recovery codes are single-use. Validation is transactional: only the request that still finds the encrypted code in the latest user secrets can
consume it successfully. A consumed or unknown recovery code returns `Invalid code`.

Recovery codes can be used for:

- browser login verification;
- disabling TOTP;
- client registration when the user has TOTP enabled.

Step-up guards that read the `sync-in-two-fa-code` header validate that header as a TOTP code only; they do not set `isRecoveryCode`.

## Step-up guards

Some authenticated routes require a fresh 2FA or password step-up. Sync-in exposes three guard variants:

| Guard                                       | Password header                     | TOTP header                       | Behavior                                                              |
|---------------------------------------------|-------------------------------------|-----------------------------------|-----------------------------------------------------------------------|
| `AuthTwoFaVerificationGuard`                | Required                            | Required only when TOTP is active | Used for destructive administrator actions.                           |
| `AuthTwoFaVerificationWithoutPasswordGuard` | Not required                        | Required only when TOTP is active | Used when the request already proved the password or only needs TOTP. |
| `AuthTwoFaVerificationOrPasswordGuard`      | Required only when TOTP is inactive | Required when TOTP is active      | Used for app-password generation and revocation.                      |

The shared headers are:

```text
sync-in-two-fa-password
sync-in-two-fa-code
```

When global TOTP is disabled, or when the loaded user has no TOTP secret, guards that allow password fallback use the current local password instead
of a TOTP code. Guards without password fallback simply allow the request when TOTP is inactive.

## API tokens and client registration

Bearer tokens are requested with:

```text
POST /api/auth/token
```

The password provider validates credentials first. If global TOTP is enabled and the user has a TOTP secret, the request must include:

```text
sync-in-two-fa-code: 123456
```

The token route does not require `sync-in-two-fa-password` because the password was already validated by the local authentication guard.

Desktop and CLI client registration also uses the configured password provider first. When TOTP is active for the user, the registration request must
include a `code` value. Sync-in first validates it as a TOTP code, then as a recovery code if TOTP validation fails.

WebDAV cannot complete an interactive TOTP challenge. When global TOTP is enabled and the user has a TOTP secret, WebDAV accepts only a valid
WebDAV-scoped app password, not the primary account password.

## Password attempts and account access

TOTP verification always reloads the user and applies the normal account-access checks. A missing user, inactive account, or account over the
password-attempt limit is rejected before code validation.

After a successful password step for a TOTP-enabled login, password attempts are preserved until the TOTP step succeeds. A successful TOTP step resets
attempts; a failed password or failed code increments attempts through the shared access tracking path.

Enable and disable requests verify the current local password before validating the code. A wrong password updates access tracking as a failed 2FA
operation and returns `Incorrect code or password`.

## Secret storage

If `auth.encryptionKey` is configured, Sync-in encrypts:

- pending setup secrets before storing them in cache;
- persisted `twoFaSecret` values;
- persisted recovery codes.

If `auth.encryptionKey` is not configured, these values are stored as plain secrets in the configured cache or database user secrets.

Changing or removing `auth.encryptionKey` after users enable TOTP makes existing TOTP secrets and recovery codes unreadable.

## Configuration reference

### TOTP settings

| Setting                 | Default   | Description                                                                      |
|-------------------------|-----------|----------------------------------------------------------------------------------|
| `auth.mfa.totp.enabled` | `true`    | Enables local Sync-in TOTP enforcement for users with `twoFaSecret`.             |
| `auth.mfa.totp.issuer`  | `Sync-in` | Issuer label embedded in the TOTP setup URL and displayed by authenticator apps. |

### Related settings

| Setting                    | Default                           | Description                                                         |
|----------------------------|-----------------------------------|---------------------------------------------------------------------|
| `auth.encryptionKey`       | Unset                             | Encrypts user secrets, including TOTP secrets and recovery codes.   |
| `auth.token.access.secret` | Required                          | Also used as the signing secret for temporary `access_2fa` tokens.  |
| `auth.token.csrf.secret`   | Derived from refresh token config | Used to sign the CSRF cookie checked during 2FA login verification. |

The temporary `access_2fa` and `csrf_2fa` token configurations are derived at startup. They reuse the normal access and CSRF cookie names and use a
fixed five-minute expiration.

## Current boundaries

- Only TOTP is implemented; WebAuthn, passkeys, SMS, email OTP, and push approval are not implemented.
- TOTP settings are global; there is no per-provider or per-group TOTP policy.
- Recovery codes are generated only when TOTP is enabled and are returned only once.
- Step-up header verification validates `sync-in-two-fa-code` as a TOTP code only, not as a recovery code.
- OIDC browser login does not receive an additional Sync-in TOTP challenge after the OIDC callback; MFA for that path is expected to be enforced by
  the identity provider.
- Enable and disable flows require the current local Sync-in password, even when the current browser session was created by OIDC.
- TOTP secrets and recovery codes depend on `auth.encryptionKey` when encryption is enabled; changing that key requires a reset of existing user TOTP
  state.
