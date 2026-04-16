export const MIN_CHARS_TO_SEARCH = 3
export const INDEXABLE_EXTENSIONS = new Set(['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'pdf', 'txt', 'md', 'html', 'htm'])
export const CACHE_INDEXING_EVENT_PREFIX = 'event-update-indexing' as const
export const CACHE_INDEXING_EVENT_LAST_RUN_KEY = 'indexing-update-last-run' as const
export const CACHE_INDEXING_EVENT_TTL = 86400 // 1 day
export const CACHE_INDEXING_RUNNING_KEY = 'indexing-running' as const
export const CACHE_INDEXING_RUNNING_TTL = 28800 // 8 hours
export const CACHE_INDEXING_LAST_RUN_KEY = 'indexing-last-run' as const
