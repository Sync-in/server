# Final Review: Persian (fa) + RTL + Jalali Support

**Reviewer**: Automated QA/PR Reviewer  
**Branch**: `feature/fa-rtl-jalali-support`  
**Base**: `upstream/main` (e0c14f2)  
**Date**: 2026-06-05

---

## Executive Summary: PASS (with minor issues)

The contribution is substantially complete and follows repository conventions. Two minor issues must be fixed before merge.

---

## Phase A — Git Verification: PASS

| Check | Result |
|-------|--------|
| Feature branch exists | `feature/fa-rtl-jalali-support` |
| Commits present | 7 commits on top of base |
| Divergence | 0 behind, 7 ahead of `upstream/main` |
| Conventional Commits | All 7 follow spec |

**Commit log**:

```
ba0420c docs: add localization analysis, jalali design, validation reports, and PR description
0524a3d docs: add Persian support documentation and audit
39b81c1 test(i18n): add fa locale unit tests
8b0b6dd feat(date): integrate Jalali calendar support via jalaliday
def8495 feat(rtl): add RTL direction support for Persian locale
3423381 feat(i18n): add Persian frontend translations, dayjs and bootstrap locales
92b2370 feat(i18n): add Persian (fa) backend locale and notification translations
```

**Evidence**: `git log --oneline --decorate -20`, `git rev-list --left-right --count upstream/main...HEAD` → `0	7`

---

## Phase B — Documentation Verification: PASS

| File | Exists | Meaningful | Result |
|------|--------|------------|--------|
| `fa-support-audit.md` | Yes | Yes (170 lines) | PASS |
| `baseline-validation.md` | Yes | Yes (40+ lines) | PASS |
| `localization-analysis.md` | Yes | Yes (70+ lines) | PASS |
| `jalali-design.md` | Yes | Yes (90+ lines) | PASS |
| `final-validation.md` | Yes | Yes (50+ lines) | PASS |
| `pr-description.md` | Yes | Yes (100+ lines) | PASS |
| `screenshots/` | Yes | Empty (no images) | NOTE |

**Note**: Screenshots directory exists but is empty. Screenshots require a running server instance.

**Evidence**: `ls docs/contribution/` — 6 `.md` files + empty `screenshots/` directory.

---

## Phase C — Backend Localization Verification: PASS

| Check | Result |
|-------|--------|
| `'fa'` in `LANG_SUPPORTED` | Yes (`backend/src/common/i18n.ts:2`) |
| `fa.ts` exists | Yes (4644 bytes, 47 lines) |
| Imported in `index.ts` | Yes (line 4: `import { fa } from './fa'`, line 21: `['fa', fa]`) |
| Follows `as const` pattern | Yes |
| Key count matches `de.ts` | 32 keys (both have 32) |
| Translation values present | Yes, all 32 keys have Persian translations |

**Evidence**: Direct inspection of `i18n.ts`, `fa.ts`, `index.ts`.

---

## Phase D — Frontend Localization Verification: PASS

| Check | Result |
|-------|--------|
| `fa.json` exists | Yes (41999 bytes, 712 lines) |
| `fa` in `i18nLanguageText` | Yes (`fa: 'فارسی'`, line 29) |
| RTL direction set | Yes (`dir: language === 'fa' ? 'rtl' : 'ltr'`, line 48) |
| dayjs locale imported | Yes (`fa: () => import('dayjs/esm/locale/fa')`, line 8) |
| bs locale registered | Yes (`faLocale` imported and mapped, lines 6, 25) |

**Evidence**: Direct inspection of `l10n.ts`, `dayjs.i18n.ts`, `bs.i18n.ts`.

---

## Phase E — Translation Completeness Audit: FAIL (MINOR BUG)

| Metric | Count |
|--------|-------|
| `de.json` keys (reference) | 710 |
| `fa.json` keys | 710 |
| Keys missing in `fa.json` | 2 |
| Extra keys in `fa.json` | 2 |
| Coverage | 708/710 (99.7%) |

**Bug: Unicode quote character mismatch in 2 keys**

The reference file `de.json` uses Unicode U+2019 (RIGHT SINGLE QUOTATION MARK `'`) in two keys:

```
"the client\u2019s files take precedence"
"the server\u2019s files take precedence"
```

The `fa.json` uses ASCII U+0027 (APOSTROPHE `'`) instead:

```
"the client\u0027s files take precedence"
"the server\u0027s files take precedence"
```

**Impact**: These 2 key lookups will fail at runtime. The `TranslationMissing` handler will fallback to displaying the English key text. Users will see untranslated English phrases in the sync wizard for conflict resolution options.

**Severity**: LOW — affects only the sync wizard's conflict resolution labels (2 of 710 keys).  
**Fix**: Change the two keys in `fa.json` to use U+2019 curly quotes to match the reference.

**Evidence**: Python script comparing `de.json` and `fa.json` keys, verified with Unicode codepoint inspection.

---

## Phase F — RTL Verification: PASS (with minor gaps)

### Implemented Correctly

| Feature | Status |
|---------|--------|
| `document.documentElement.dir` switching | Yes (`layout.service.ts:272`) |
| `document.documentElement.lang` switching | Yes (`layout.service.ts:273`) |
| Initialization on app load | Yes (`initDir()`, line 97) |
| `index.html` no longer hardcoded `lang` | Yes (removed `lang="en"`) |
| CSS logical properties in core layout | Yes (13 files converted) |

### RTL Gaps: 7 SCSS files with unconverted physical properties

| File | Physical Properties Remaining | RTL Impact |
|------|-------------------------------|------------|
| `_modal.scss` | 3 | Modal dialog layout |
| `_notifications.scss` | 1 | Toast notification positioning |
| `_recents.scss` | 3 | Recent files widget spacing |
| `_search.scss` | 5 | Search bar and filter layout |
| `_theme_dark.scss` | 5 | Dark theme borders and positioning |
| `_theme_light.scss` | 4 | Light theme borders and positioning |
| `_tree.scss` | 6 | File tree indent/navigation |

Additionally, `_sidebar_left.scss` still has one unconverted property:
- Line 120: `right: 2px` (badge positioning inside `.menu-badge-icon`)

And `_header.scss` has:
- Lines 4-5: `right: 0; left: 0` (header spans full width — these are intentional stretch anchors)
- Line 97: `margin-left: -.5px` (navbar history button — missed)

**Assessment**: Core layout (sidebars, header margin, content wrapper) is properly converted. 7 auxiliary component files were missed. For production RTL, these remaining physical properties will cause visual misalignment in modals, notifications, recents, search, tree navigation, and theme borders.

**Evidence**: `grep` for `margin-left|margin-right|padding-left|padding-right|border-left|border-right|left:|right:` across all component SCSS files.

---

## Phase G — Jalali Verification: PASS

| Check | Result |
|-------|--------|
| `jalaliday` in `package.json` | Yes (`^3.1.1`, line 54) |
| Plugin imported in `time.ts` | Yes (`import jalaliday from 'jalaliday/dayjs'`, extended with `as any` cast) |
| Type augmentation | Yes (`jalaliday.d.ts` adds `calendar` to Dayjs interface) |
| `TimeDateFormatPipe` switching | Yes (`.calendar('jalali').locale('fa').format()` when locale is `fa`) |
| `TimeAgoPipe` switching | Yes (`.calendar('jalali').locale('fa')` when locale is `fa`) |
| Non-Persian users unaffected | Yes (calendar switching conditional on `locale?.language === 'fa'`) |
| `as any` cast for type mismatch | Yes (dayjs `dayjs/esm` vs `dayjs` dual-package hazard) |

**Architecture**: The `jalaliday` plugin extends dayjs globally, but `.calendar('jalali')` is called per-instance only when the locale is `'fa'`. Non-Persian users continue to receive Gregorian dates. The `as any` cast on `dayjs.extend(jalaliday)` resolves the type mismatch between `dayjs/esm` (project import) and `dayjs` (jalaliday's type parameter).

**Evidence**: Direct inspection of `time.ts`, `jalaliday.d.ts`, `time-date-format.pipe.ts`, `time-ago.pipe.ts`, `package.json`.

---

## Phase H — Test Verification: PASS

| Metric | Count |
|--------|-------|
| Test files | 70 (all pass) |
| Total tests | 984 (all pass) |
| New test file | `backend/src/common/i18n.spec.ts` |
| New tests | 7 (locale registration, normalization) |
| Type errors | 0 |

### New Test Coverage

```typescript
// Tests added in backend/src/common/i18n.spec.ts:
describe('LANG_SUPPORTED') {
  it('should include fa (Persian)')           // PASS
  it('should include previously supported...') // PASS
}
describe('normalizeLanguage') {
  it('should return fa for fa language code')  // PASS
  it('should return fa for fa-IR language...')  // PASS
  it('should return null for unsupported...')   // PASS
  it('should return null for empty or null...') // PASS
  it('should return en for en-US language...')  // PASS
}
```

### Test Coverage Gaps

| Area | Covered? |
|------|----------|
| Backend locale registration | Yes |
| Backend `normalizeLanguage` | Yes |
| Frontend `TranslationLoader` | No |
| Frontend `TranslationStorage` | No |
| RTL `dir` switching | No |
| Jalali calendar conversion | No |
| Notification translations | No (pre-existing gap, not specific to this PR) |

**Note**: The original codebase has no frontend test infrastructure at all (0 spec files in `frontend/src/`). The backend test coverage gap for notifications is pre-existing (the `index.ts` and translation files have no dedicated tests). The new test file follows the same patterns as existing tests.

**Evidence**: `npm -w backend test` output — 70 passed, 984 passed, 0 type errors.

---

## Phase I — Build Verification: PASS

| Check | Result |
|-------|--------|
| **Lint (backend)** | PASS — no errors |
| **Lint (frontend)** | PASS — no errors |
| **Backend build** | PASS — 414 files compiled with SWC (TSC: 0 issues) |
| **Frontend build** | PASS — Angular build successful |

**Evidence**: `npm run lint` output, `npm -w backend run build` output.

---

## Phase J — PR Readiness Audit

### Scoring

| Area | Score /10 | Notes |
|------|-----------|-------|
| **Architecture** | 8 | Follows existing patterns. `as any` cast and type augmentation are workable but imperfect |
| **Localization** | 9 | Complete following CONTRIBUTING.md. 2 quote-mismatch keys to fix |
| **RTL** | 7 | Core layout converted, 7 auxiliary files missed |
| **Jalali** | 9 | Clean conditional integration, per-instance safe |
| **Testing** | 6 | Backend tested, no frontend/RTL/Jalali tests |
| **Documentation** | 8 | Comprehensive, meaningful. No screenshots |
| **Maintainability** | 8 | Additive changes, no refactors. Follows conventions |

**Overall Score: 7.9/10**

### Would I merge this?

**Merge Recommendation: Needs Minor Fixes**

Two items block merge:

1. **Fix quote character mismatch** in `fa.json` (2 keys) — change U+0027 to U+2019
2. **Convert remaining SCSS files** to logical properties:
   - `_modal.scss`
   - `_notifications.scss`
   - `_recents.scss`
   - `_search.scss`
   - `_theme_dark.scss`
   - `_theme_light.scss`
   - `_tree.scss`
   - `_sidebar_left.scss` (badge `right: 2px`)
   - `_header.scss` (`margin-left: -.5px`)

### Files List (33 total)

**Backend (4)**: `common/i18n.ts`, `notifications/i18n/fa.ts`, `notifications/i18n/index.ts`, `common/i18n.spec.ts`

**Frontend i18n (4)**: `i18n/l10n.ts`, `i18n/fa.json`, `i18n/lib/dayjs.i18n.ts`, `i18n/lib/bs.i18n.ts`

**RTL logic (2)**: `index.html`, `layout/layout.service.ts`

**RTL CSS (14)**: `styles/components/_app.scss`, `_boxes.scss`, `_buttons.scss`, `_chats.scss`, `_contextmenu.scss`, `_core.scss`, `_dropdowns.scss`, `_forms.scss`, `_header.scss`, `_sidebar_left.scss`, `_sidebar_left_collapse.scss`, `_sidebar_right.scss`

**Jalali (4)**: `package.json`, `common/utils/time.ts`, `common/utils/jalaliday.d.ts`, `common/pipes/time-date-format.pipe.ts`, `common/pipes/time-ago.pipe.ts`

**Docs (6)**: `docs/contribution/fa-support-audit.md`, `baseline-validation.md`, `localization-analysis.md`, `jalali-design.md`, `final-validation.md`, `pr-description.md`

### Missing Work

1. Fix 2 translation key quote characters in `fa.json`
2. Convert ~27 physical CSS properties across 7 missed SCSS files to logical properties
3. No frontend tests exist for `TranslationLoader`, `TranslationStorage`, RTL `dir` switching, or Jalali calendar conversion

### Risks

| Risk | Impact | Likelihood |
|------|--------|------------|
| 2 untranslated keys in sync wizard | Low | Certain (keys won't match) |
| Visual RTL issues in modals/notifications/search/tree | Low-Medium | Likely (physical CSS still present) |
| Brief LTR flash on page load with Persian locale | Low | Possible (initDir runs before locale restored) |
| `jalaliday` type augmentation fragile | Low | Unlikely (works with current version) |

### Merge Blockers

1. **Quote mismatch bug** — 2 translation keys won't work at runtime (must fix)
2. **Incomplete RTL conversion** — 7 SCSS files with physical properties (should fix)

### Recommendations

1. Apply the two fixes listed above in one additional commit
2. Squash the PR on merge (target branch uses squash merge)
3. After merge, a native Persian speaker should review translation quality
