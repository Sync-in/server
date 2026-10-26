# Path filters

This module mirrors `core/components/utils/path-filters/` in `sync-in-desktop`. Keep validation, limits, RE2JS flags, dependency versions,
complexity estimation, types, and tests synchronized. Only import extensions and test setup may differ.

`path-filter-compiler.interface.ts` is intentionally colocated with the compiler as an exception to the component-wide `interfaces/` convention.

## Contract

- `buildPathFilterSource()` validates the filter list and combined length, ignores empty entries, preserves non-empty regex syntax, and returns the historical `string | null` wire format.
- `compilePathFilters()` parses the source once and evaluates only root alternatives. A globally invalid source is rejected as a whole.
- `validatePathFilterList()` marks empty entries as invalid and maps rejected alternatives back to their original filter indexes for user interfaces.
- Oversized, unsupported, or over-budget alternatives are ignored independently; later alternatives are still evaluated. Budgets reserved before RE2JS compilation are never refunded.
- Accepted alternatives use a case-insensitive RE2JS matcher. If none remain, synchronization continues without custom exclusions.
- The desktop sends the original combined source so both sides apply the same deterministic selection.
