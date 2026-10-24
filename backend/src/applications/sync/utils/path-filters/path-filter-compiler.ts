import type { AST } from '@eslint-community/regexpp'
import { RE2JS, RE2JSCompileException, RE2JSSyntaxException } from 're2js'
import {
  SYNC_MAX_PATH_FILTER_LENGTH,
  SYNC_MAX_PATH_FILTER_PARSE_COST,
  SYNC_MAX_PATH_FILTER_PATTERN_LENGTH,
  SYNC_MAX_PATH_FILTER_PROGRAM_SIZE,
  SYNC_MAX_PATH_FILTERS,
  SYNC_PATH_FILTER_RE2_FLAGS
} from './constants.js'
import { PathFilterError } from './errors.js'
import type { SyncPathFilterComplexity, SyncPathFilterRejection, SyncPathFiltersResult } from './path-filter-compiler.interface.js'
import { getPathFilterAlternativeComplexity, parsePathFilterAlternatives } from './path-filter-complexity.js'

export function buildPathFilterSource(filters: readonly string[]): string | null {
  if (!Array.isArray(filters)) {
    throw new PathFilterError('Invalid path filters')
  }

  if (filters.length > SYNC_MAX_PATH_FILTERS) {
    throw new PathFilterError('Too many path filters')
  }

  const nonEmptyFilters: string[] = []
  let sourceLength = 0
  for (const filter of filters) {
    // Array iteration exposes sparse entries as undefined, unlike some().
    if (typeof filter !== 'string') {
      throw new PathFilterError('Invalid path filters')
    }
    if (!filter.trim()) {
      continue
    }
    sourceLength += filter.length + (nonEmptyFilters.length ? 1 : 0)
    nonEmptyFilters.push(filter)
  }
  if (sourceLength > SYNC_MAX_PATH_FILTER_PATTERN_LENGTH) {
    throw new PathFilterError('Path filter pattern is too long')
  }

  return nonEmptyFilters.length ? nonEmptyFilters.join('|') : null
}

// Compile only after validation and budget checks; unexpected engine failures must propagate.
function compileRE2PathFilter(source: string): RE2JS {
  try {
    return RE2JS.compile(source, SYNC_PATH_FILTER_RE2_FLAGS)
  } catch (error) {
    if (error instanceof RE2JSSyntaxException || error instanceof RE2JSCompileException) {
      throw new PathFilterError('Invalid or unsupported path filter pattern')
    }
    throw error
  }
}

// Both public entry points reuse this step so list validation keeps the parser's
// source offsets without parsing the same expression twice.
function compilePathFilterAlternatives(alternatives: AST.Alternative[]): SyncPathFiltersResult {
  const accepted: string[] = []
  const rejected: SyncPathFilterRejection[] = []
  const namedGroups = new Set<string>()
  let remainingCompileSize = SYNC_MAX_PATH_FILTER_PROGRAM_SIZE
  let remainingParseCost = SYNC_MAX_PATH_FILTER_PARSE_COST
  let matcher: RE2JS | null = null

  for (const [index, alternative] of alternatives.entries()) {
    const pattern = alternative.raw
    if (pattern.length > SYNC_MAX_PATH_FILTER_LENGTH) {
      rejected.push({ index, pattern, reason: 'Path filter pattern is too long' })
      continue
    }

    let complexity: SyncPathFilterComplexity
    try {
      complexity = getPathFilterAlternativeComplexity(alternative, SYNC_MAX_PATH_FILTER_PROGRAM_SIZE, SYNC_MAX_PATH_FILTER_PARSE_COST)
    } catch (error) {
      if (error instanceof SyntaxError) {
        rejected.push({ index, pattern, reason: 'Invalid or unsupported path filter pattern' })
        continue
      }
      throw error
    }

    if (complexity.captureNames.some((name) => namedGroups.has(name))) {
      rejected.push({ index, pattern, reason: 'Invalid or unsupported path filter pattern' })
      continue
    }

    if (complexity.programSize > remainingCompileSize || complexity.parseCost > remainingParseCost) {
      rejected.push({ index, pattern, reason: 'Path filter pattern is too complex' })
      continue
    }

    // Standalone estimates include shared overhead, so their sum also bounds the final combined program.
    // Failed RE2 syntax checks consume work too; never refund either reservation.
    remainingCompileSize -= complexity.programSize
    remainingParseCost -= complexity.parseCost

    try {
      matcher = compileRE2PathFilter(pattern || '(?:)')
    } catch (error) {
      if (error instanceof PathFilterError) {
        rejected.push({ index, pattern, reason: error.message })
        continue
      }
      throw error
    }

    for (const name of complexity.captureNames) {
      namedGroups.add(name)
    }
    accepted.push(pattern)
  }

  if (accepted.length > 1) {
    matcher = compileRE2PathFilter(accepted.join('|'))
  }
  return { matcher, rejected }
}

export function compilePathFilters(source: string | null): SyncPathFiltersResult {
  if (source === null || source === '') {
    return { matcher: null, rejected: [] }
  }
  if (typeof source !== 'string') {
    throw new PathFilterError('Invalid path filters')
  }
  if (source.length > SYNC_MAX_PATH_FILTER_PATTERN_LENGTH) {
    throw new PathFilterError('Path filter pattern is too long')
  }

  let alternatives: AST.Alternative[]
  try {
    alternatives = parsePathFilterAlternatives(source)
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) {
      const reason = error instanceof RangeError ? 'Path filter pattern is too complex' : 'Invalid or unsupported path filter pattern'
      return { matcher: null, rejected: [{ index: 0, pattern: source, reason }] }
    }
    throw error
  }

  return compilePathFilterAlternatives(alternatives)
}

export function validatePathFilterList(filters: readonly string[]): number[] {
  if (!Array.isArray(filters)) {
    throw new PathFilterError('Invalid path filters')
  }

  const invalidIndexes = new Set<number>()
  const candidates: string[] = []
  const candidateIndexes: number[] = []

  // Discard entries that cannot safely participate in the combined parse while
  // preserving their original indexes for per-field feedback.
  for (const [index, filter] of filters.entries()) {
    if (index >= SYNC_MAX_PATH_FILTERS || typeof filter !== 'string') {
      invalidIndexes.add(index)
      continue
    }
    if (!filter.trim()) {
      invalidIndexes.add(index)
      continue
    }
    if (filter.length > SYNC_MAX_PATH_FILTER_LENGTH) {
      invalidIndexes.add(index)
      continue
    }

    candidates.push(filter)
    candidateIndexes.push(index)
  }

  if (!candidates.length) {
    return [...invalidIndexes]
  }

  let alternatives: AST.Alternative[]
  try {
    const source = buildPathFilterSource(candidates)!
    alternatives = parsePathFilterAlternatives(source)
  } catch (error) {
    if (error instanceof PathFilterError || error instanceof SyntaxError || error instanceof RangeError) {
      return [...filters.keys()]
    }
    throw error
  }

  let rejected: SyncPathFilterRejection[]
  try {
    rejected = compilePathFilterAlternatives(alternatives).rejected
  } catch (error) {
    // Only controlled compilation errors invalidate candidates; engine failures
    // must still surface instead of being mistaken for user input errors.
    if (error instanceof PathFilterError) {
      return [...filters.keys()]
    }
    throw error
  }

  if (!rejected.length) {
    return [...invalidIndexes]
  }

  let offset = 0
  const ranges = candidates.map((filter, index) => {
    const range = { index: candidateIndexes[index], start: offset, end: offset + filter.length }
    offset = range.end + 1
    return range
  })

  // Both collections follow source order; inclusive bounds retain empty alternatives.
  let firstRange = 0
  for (const rejection of rejected) {
    const alternative = alternatives[rejection.index]
    while (firstRange < ranges.length && ranges[firstRange].end < alternative.start) {
      firstRange++
    }
    for (let index = firstRange; index < ranges.length && ranges[index].start <= alternative.end; index++) {
      invalidIndexes.add(ranges[index].index)
    }
  }

  return [...invalidIndexes].sort((a, b) => a - b)
}
