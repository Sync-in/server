# Localization Analysis

Analysis of the Sync-in localization architecture for adding Persian (fa) support.

## Translation Format

### Backend

- **Format**: TypeScript constant exports
- **Pattern**: `export const xx = { 'English Key': 'Translated Value', ... } as const`
- **Keys**: English strings serve as lookup keys
- **Registration**: Map in `index.ts` via `translations.set(locale, translationObj)`
- **Usage**: `translateObject(language, obj)` mutates English values to translations

### Frontend

- **Format**: JSON files (`{ "English Key": "Translated Value", ... }`)
- **Keys**: English strings with ICU-style interpolation (`{{ param }}`)
- **Registration**: Dynamic import via `TranslationLoader.get()` in `l10n.ts`
- **Framework**: `angular-l10n` library

## Naming Conventions

- **Backend**: `xx.ts` or `xx_yy.ts` (lowercase, underscore for region)
  - Examples: `de.ts`, `pt_br.ts`
- **Frontend**: `xx.json` or `xx-YY.json` (lowercase, hyphen for region)
  - Examples: `de.json`, `pt-BR.json`

## Locale Registration Pattern

### Backend (`backend/src/common/i18n.ts`)

```typescript
export const LANG_SUPPORTED = new Set(['de', 'en', ...] as const)
```

### Frontend (`frontend/src/i18n/l10n.ts`)

```typescript
export const i18nLanguageText: Record<...> = { de: 'Deutsch', en: 'English', ... }
const LANG_SCHEMA = [...]  // language + direction mapping
```

## Language Selector

- Embedded `<select>` in `user-account.component.html`
- Driven by `LayoutService.getLanguages()`
- `LayoutService.setLanguage()` syncs dayjs locale, ngx-bootstrap locale, and angular-l10n

## Libraries

| Library | Purpose | Locale Count |
|---------|---------|-------------|
| `dayjs` v1.11.20 | Date formatting, relative time | 15 locales |
| `ngx-bootstrap/chronos` | Datepicker | 15 locales |
| `angular-l10n` | UI translations | 15 languages |

## Translation Key Count

- **Backend notification**: ~45 keys per language
- **Frontend UI**: ~712 keys per language

## Key Findings for Persian Support

1. **Backend**: Add `'fa'` to `LANG_SUPPORTED`, create `fa.ts`, register in `index.ts`
2. **Frontend**: Add `fa: 'فارسی'` to `i18nLanguageText`, create `fa.json`, register dayjs/bs locales
3. **RTL**: The `LANG_SCHEMA` type accepts `'rtl'` — set for `fa` locale
4. **ngx-bootstrap**: `faLocale` is available in the chronos module
5. **dayjs**: Official `fa` locale available at `dayjs/esm/locale/fa`
