import { RE2JS } from 're2js'

export const SYNC_MAX_PATH_FILTERS = 100
export const SYNC_MAX_PATH_FILTER_WARNINGS = 100
export const SYNC_MAX_PATH_FILTER_LENGTH = 1024
export const SYNC_MAX_PATH_FILTER_PATTERN_LENGTH = SYNC_MAX_PATH_FILTERS * SYNC_MAX_PATH_FILTER_LENGTH + (SYNC_MAX_PATH_FILTERS - 1)
// Unicode property escapes are disabled because RE2JS expands their tables synchronously while parsing.
export const SYNC_PATH_FILTER_RE2_FLAGS = RE2JS.CASE_INSENSITIVE | RE2JS.DISABLE_UNICODE_GROUPS
// Bound the combined filter's estimated program size independently of source length.
export const SYNC_MAX_PATH_FILTER_PROGRAM_SIZE = 16_384
export const SYNC_MAX_PATH_FILTER_PARSE_COST = 100_000
