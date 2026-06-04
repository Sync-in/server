# Pull Request Description

## Summary

Adds Persian (fa/Farsi) language support to the Sync-in server, including:

- Full Persian UI translations (~712 keys)
- Persian notification email translations
- RTL (right-to-left) layout support
- Jalali (Persian/Shamsi) calendar integration

## Motivation

Persian-speaking users currently cannot use Sync-in in their native language. This PR adds complete Persian localization with culturally appropriate calendar support (Jalali/Shamsi calendar).

## Architecture Decisions

### 1. Translation Pattern

Follows the exact same pattern as all other languages:
- Backend: `export const fa = { 'English Key': 'Translation', ... } as const`
- Frontend: JSON file with English keys → Persian values
- Both `dayjs` locale (`dayjs/esm/locale/fa`) and `ngx-bootstrap` locale (`faLocale`) are available natively

### 2. RTL Implementation

Uses CSS logical properties instead of separate RTL overrides:
- `margin-left` → `margin-inline-start`
- `margin-right` → `margin-inline-end`
- `padding-left` → `padding-inline-start`
- `padding-right` → `padding-inline-end`
- `left` → `inset-inline-start`
- `right` → `inset-inline-end`
- `border-left` → `border-inline-start`
- `border-right` → `border-inline-end`

The `<html dir>` attribute is dynamically set based on locale in `LayoutService`.

### 3. Jalali Calendar

Uses the `jalaliday` package — the standard dayjs extension for the Jalali/Persian calendar. Calendar conversion is applied per-instance only when the locale is `fa`:
```typescript
dJs(value).calendar('jalali').locale('fa').format(format)
```

Non-Persian users are unaffected.

## Files Changed

### Backend (4 files)
- `backend/src/common/i18n.ts` — Add `fa` to `LANG_SUPPORTED`
- `backend/src/applications/notifications/i18n/fa.ts` — Persian notification translations
- `backend/src/applications/notifications/i18n/index.ts` — Register `fa`
- `backend/src/common/i18n.spec.ts` — Unit tests for `fa` locale

### Frontend — Localization (4 files)
- `frontend/src/i18n/l10n.ts` — Add `fa` locale with RTL direction
- `frontend/src/i18n/fa.json` — Full Persian UI translations
- `frontend/src/i18n/lib/dayjs.i18n.ts` — Add `fa` dayjs locale loader
- `frontend/src/i18n/lib/bs.i18n.ts` — Register `faLocale` for datepicker

### Frontend — RTL (16 files)
- `frontend/src/index.html` — Remove hardcoded `lang`, enable dynamic dir
- `frontend/src/app/layout/layout.service.ts` — Set `dir`/`lang` on locale change
- 14 SCSS files — Convert physical properties to logical properties

### Frontend — Jalali (5 files)
- `frontend/package.json` — Add `jalaliday` dependency
- `frontend/src/app/common/utils/time.ts` — Extend dayjs with jalaliday
- `frontend/src/app/common/utils/jalaliday.d.ts` — Type augmentation
- `frontend/src/app/common/pipes/time-date-format.pipe.ts` — Jalali formatting
- `frontend/src/app/common/pipes/time-ago.pipe.ts` — Jalali relative time

## Testing

```
Test Files  70 passed (70/+1 new)
     Tests  984 passed (984/+7 new)
```

- All 977 pre-existing tests pass
- 7 new tests for Persian locale registration
- Lint passes on both backend and frontend
- Both builds pass (backend: 414 files, frontend: ~8MB)

## Backward Compatibility

This is a fully additive change:
- All existing languages behave identically to before
- English remains the default language
- RTL is only activated when locale is `fa`
- Jalali calendar is only used when locale is `fa`

## Risk Analysis

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| RTL CSS changes break LTR layout | Medium | Low | CSS logical properties are well-supported; Bootstrap 5 natively RTL-aware |
| jalaliday type incompatibility | Low | Low | Type augmentation file resolves; `as any` cast for extend |
| Translation quality | Low | Medium | Initial AI-assisted translation; native speaker review recommended |
| Missing translation keys | Low | Low | TranslationMissing handler falls back to English keys |

## Screenshots

To be captured after deploying the build with Persian locale active.
