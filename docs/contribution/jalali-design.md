# Jalali Calendar Design

Design decisions for integrating Jalali (Persian) calendar support.

## Context

Sync-in uses **dayjs** for all date handling:
- `frontend/src/app/common/utils/time.ts` — Central dayjs instance with plugins
- `amDateFormat` pipe — Date formatting via `dJs(value).format()`
- `amTimeAgo` pipe — Relative time via `dJs(value).from()`

## Options Considered

### Option A: `jalaliday` npm package (SELECTED)

- **Package**: `jalaliday/dayjs` — Official dayjs extension for Jalali calendar
- **API**: `dayjs().calendar('jalali').locale('fa').format(...)`
- **Scope**: Per-instance calendar selection (`.calendar('jalali')` returns a new Dayjs instance)
- **Maintenance**: Actively maintained, 6.5K+ weekly downloads
- **Risk**: Patches dayjs prototype globally, but calendar selection is per-instance

### Option B: Custom Jalali Date Pipe

- **Approach**: Implement Jalali ↔ Gregorian conversion from scratch
- **Pros**: Zero external dependencies
- **Cons**: More code, more maintenance, reinventing the wheel

## Decision: Option A — `jalaliday`

### Rationale

1. **Idiomatic**: Extends dayjs the same way other plugins do
2. **Minimal changes**: Only 3 files modified
3. **Per-instance safety**: `.calendar('jalali')` affects only that Dayjs chain
4. **Proven**: Widely used in the Persian developer community
5. **All dayjs features preserved**: `format()`, `from()`, `diff()`, `add()`, `subtract()` all work with Jalali calendar

## Implementation

### File: `frontend/src/app/common/utils/time.ts`

```typescript
import jalaliday from 'jalaliday/dayjs'
dayjs.extend(jalaliday)
```

### File: `frontend/src/app/common/utils/jalaliday.d.ts`

Type augmentation to add `calendar` method to dayjs/esm Dayjs type.

### File: `frontend/src/app/common/pipes/time-date-format.pipe.ts`

```typescript
if (this.locale?.language === 'fa') {
  return date.calendar('jalali').locale('fa').format(format)
}
return date.format(format)
```

### File: `frontend/src/app/common/pipes/time-ago.pipe.ts`

Same pattern — check locale, chain `.calendar('jalali')` when Persian.

## Calendar Behavior

| Language | Calendar | Example Output |
|----------|----------|---------------|
| en, de, fr, ... | Gregorian | `06/05/2026 12:00:00` |
| fa | Jalali | `1405/03/15 12:00:00` |

## Risk Mitigation

1. **Regression**: Non-Persian users are unaffected — `.calendar('jalali')` is only called when `locale === 'fa'`
2. **Type safety**: Type augmentation file `jalaliday.d.ts` ensures TypeScript recognizes `calendar` method
3. **Dual-package hazard**: `dayjs/esm` import used for type compatibility; `jalaliday.extend` cast as `any` to resolve type mismatch between `dayjs` and `dayjs/esm`

## Dependencies Added

- `jalaliday` — Day.js Jalali calendar plugin

## Testing

- Unit test in `backend/src/common/i18n.spec.ts` validates `fa` locale registration
- Existing 977 tests continue to pass with no regressions
