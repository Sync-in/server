# Persian (fa) + RTL + Jalali Support — Repository Audit

## Repository Architecture

### Overview

Sync-in is a self-hosted file storage, synchronization, and collaboration platform.

- **Monorepo**: npm workspaces with `backend` and `frontend` packages
- **Backend**: NestJS + Fastify (Node.js TypeScript)
- **Frontend**: Angular 20 (TypeScript)
- **Database**: MariaDB via Drizzle ORM
- **Testing**: Vitest (backend only, 68 spec files)
- **Styling**: Bootstrap 5 + custom SCSS

### Key Files

| File | Purpose |
|------|---------|
| `package.json` | Root workspace orchestrator, shared scripts |
| `backend/package.json` | NestJS backend dependencies and scripts |
| `frontend/package.json` | Angular frontend dependencies and scripts |
| `CONTRIBUTING.md` | Contribution guidelines, i18n instructions |

---

## Localization Architecture

### Backend i18n

**Entry point**: `backend/src/common/i18n.ts`

- `LANG_SUPPORTED`: Set of 14 supported languages (de, en, es, fr, hi, it, ja, ko, nl, pl, pt, pt-BR, ru, tr, zh)
- `normalizeLanguage()`: Validates and normalizes language codes
- Types: `i18nLocaleSupported`, `i18nLocale`

**Notification translations**: `backend/src/applications/notifications/i18n/`

- Per-language TypeScript files (e.g., `de.ts`, `fr.ts`, `pt_br.ts`)
- Pattern: `export const xx = { 'English Key': 'Translated Value', ... } as const`
- Central registry in `index.ts`: `Map<i18nLocale, Record<string, string>>`
- `translateObject(language, obj)`: Mutates English values to translations in-place
- Used by 10 email notification types in `notifications/mails/models.ts`

### Frontend i18n

**Entry point**: `frontend/src/i18n/l10n.ts`

- Uses `angular-l10n` library for translation management
- `i18nLanguageText`: Mapping of locale to display name
- `LANG_SCHEMA`: Array of `{ locale: { language }, dir: 'ltr' | 'rtl' }`
- `TranslationLoader`: Dynamic JSON imports per language
- `TranslationStorage`: sessionStorage-based locale persistence

**Translation files**: `frontend/src/i18n/*.json`

- 15 JSON files (de, en, es, fr, hi, it, ja, ko, nl, pl, pt, pt-BR, ru, tr, zh)
- Keys are English strings, values are translations
- ICU-style interpolation: `{{ param }}`
- ~712 keys per language file

**Locale libraries**: `frontend/src/i18n/lib/`

- `bs.i18n.ts`: ngx-bootstrap datepicker locales (14 languages)
- `dayjs.i18n.ts`: Day.js locale loaders (14 languages)

### Language Switching Flow

1. User selects language in `user-account.component.html` dropdown
2. `user-account.component.ts` calls `layout.setLanguage()`
3. `LayoutService.setLanguage()` calls `translation.setLocale({ language })`
4. `TranslationLoader.get()` triggers:
   - `loadDayjsLocale(language)` — sets dayjs locale
   - `loadBootstrapLocale(language)` — sets ngx-bootstrap datepicker locale
   - `this.bsLocale.use(language)` — BsLocaleService
   - Dynamic import of `./{language}.json` — UI translations

---

## Date Handling Architecture

### Core Utility

**File**: `frontend/src/app/common/utils/time.ts`

```typescript
import dayjs from 'dayjs/esm'
import duration from 'dayjs/esm/plugin/duration'
import localizedFormat from 'dayjs/esm/plugin/localizedFormat'
import relativeTime from 'dayjs/esm/plugin/relativeTime'
import utc from 'dayjs/esm/plugin/utc'
// Extends dayjs with 4 plugins
export { dayjs as dJs }
```

### Date Pipes

| Pipe | Purpose | Location |
|------|---------|----------|
| `amDateFormat` | Format date with `dJs(value).format()` | `time-date-format.pipe.ts:12` |
| `amTimeAgo` | Relative time with `d.from(dJs())` | `time-ago.pipe.ts:48` |

### Datepicker

- ngx-bootstrap `BsDatepickerModule`
- Locale synced via `bs.i18n.ts` + `BsLocaleService.use()`
- Custom themed in `_datepicker.scss`

### Current Libraries

- dayjs ^1.11.13
- No Jalali/calendar plugin imported

---

## RTL Readiness

### Current State

- `L10nSchema` type accepts `'rtl'` as `dir` value
- **All 15 languages are hardcoded as `dir: 'ltr'`** in `LANG_SCHEMA`
- `index.html` has `<html lang="en">` with **no `dir` attribute**
- No `dir="rtl"` or `direction: rtl` in any template or stylesheet
- No RTL-specific CSS rules exist

### RTL Support Required

1. **HTML**: Add dynamic `dir` and `lang` attributes
2. **SCSS**: Convert physical properties to logical properties in:
   - `_sidebar_left.scss` (left positioning)
   - `_sidebar_right.scss` (right positioning)
   - `_sidebar_left_collapse.scss` (margin-left)
   - `_app.scss` (layout properties)
   - `_datepicker.scss` (review only, ngx-bootstrap handles its own RTL)
3. **Bootstrap 5**: Natively RTL-aware via `[dir="rtl"]` CSS

### CSS Logical Properties Mapping

| Physical | Logical |
|----------|---------|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `left` | `inset-inline-start` |
| `right` | `inset-inline-end` |
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |

---

## Testing Architecture

- **Framework**: Vitest v4 with `@nestjs/testing`
- **Location**: `backend/src/**/*.spec.ts` (68 files)
- **Config**: `vitest.config.mts` (unit), `vitest-e2e.config.mts` (e2e)
- **Frontend**: No test infrastructure (no spec files, no Karma/Jest/Vitest)
- **i18n coverage**: No dedicated i18n tests; language tested incidentally in user/notification services

---

## Potential Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `jalaliday` patches dayjs prototype globally | Low | `.calendar('jalali')` is per-instance; only called when locale=`fa` |
| RTL CSS changes break existing LTR layout | Medium | Full logical properties approach; validated per-file |
| ngx-bootstrap lacks `fa` locale for datepicker | Low | Register custom Persian locale with Jalali month names |
| Translation quality for Persian | Medium | AI-assisted initial translation; review by native speaker |
| Day.js `fa` locale | Low | Official dayjs locale exists at `dayjs/locale/fa` |
