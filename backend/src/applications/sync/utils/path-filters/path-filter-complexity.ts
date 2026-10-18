import { type AST, RegExpParser } from '@eslint-community/regexpp'
import type { SyncPathFilterComplexity, SyncPathFilterParseBudget } from './path-filter-compiler.interface.js'

const pathFilterParser = new RegExpParser({ ecmaVersion: 2025 })
const RE2_PROGRAM_OVERHEAD = 2
// RE2JS expands predefined classes into rune ranges while parsing them.
const RE2_ASCII_CLASS_PARSE_COST = 128
const SUPPORTED_CLASS_ESCAPE_PATTERN = /^\\(?:[0fnrtv]|x[0-9a-fA-F]{2}|[^a-zA-Z0-9\u0080-\uffff])$/
const LEADING_ZERO_REPEAT_PATTERN = /^\{(?:0\d|[0-9]+,0\d)/

function getClassCharacterValue(character: AST.Character): number {
  // Only accept escapes whose values agree between legacy JavaScript and RE2JS.
  if (character.raw.startsWith('\\') && !SUPPORTED_CLASS_ESCAPE_PATTERN.test(character.raw)) {
    throw new SyntaxError('Unsupported path filter character class escape')
  }

  return character.value
}

function consumeCharacterClassParseBudget(characterClass: AST.CharacterClass, parseBudget: SyncPathFilterParseBudget): void {
  if (characterClass.unicodeSets || characterClass.elements.length === 0) {
    throw new SyntaxError('Unsupported path filter character class')
  }

  for (const element of characterClass.elements) {
    if (element.type === 'CharacterClassRange') {
      const min = getClassCharacterValue(element.min)
      const max = getClassCharacterValue(element.max)
      if ((min >= 0xd800 && min <= 0xdfff) || (max >= 0xd800 && max <= 0xdfff)) {
        throw new SyntaxError('Astral path filter character class ranges are not supported')
      }
      parseBudget.remaining -= max - min + 1
    } else if (element.type === 'Character') {
      getClassCharacterValue(element)
      if (element.raw === '[' && characterClass.raw[element.end - characterClass.start] === ':') {
        throw new SyntaxError('POSIX path filter character classes are not supported')
      }
      parseBudget.remaining -= 1
    } else {
      parseBudget.remaining -= RE2_ASCII_CLASS_PARSE_COST
    }

    if (parseBudget.remaining < 0) {
      return
    }
  }
}

function estimateProgramSize(
  alternatives: AST.Alternative[],
  overflow: number,
  parseBudget: SyncPathFilterParseBudget,
  captureNames: string[]
): number {
  let size = Math.max(0, alternatives.length - 1)

  // Clamp every addition so large bounded repetitions cannot grow the estimate itself.
  for (const alternative of alternatives) {
    for (const element of alternative.elements) {
      size = Math.min(overflow, size + estimateElementProgramSize(element, overflow, parseBudget, captureNames))
      if (parseBudget.remaining < 0) {
        return overflow
      }
    }
  }

  return Math.max(1, size)
}

function estimateElementProgramSize(element: AST.Element, overflow: number, parseBudget: SyncPathFilterParseBudget, captureNames: string[]): number {
  if (element.type === 'CapturingGroup' && element.name !== null) {
    captureNames.push(element.name)
  }

  // RE2 quoting would turn regexpp's quantifiers into literals during compilation.
  if (element.type === 'Character' && (element.raw === '\\Q' || element.raw === '\\E')) {
    throw new SyntaxError('RE2 quoted literals are not supported in path filters')
  }

  if (element.type === 'Quantifier') {
    const quantifierStart = element.element.end - element.start
    // RE2JS treats repeat counts with leading zeros as literals, unlike regexpp.
    if (element.raw[quantifierStart] === '{' && LEADING_ZERO_REPEAT_PATTERN.test(element.raw.slice(quantifierStart))) {
      throw new SyntaxError('Path filter quantifiers must not contain leading zeros')
    }

    const elementSize = estimateElementProgramSize(element.element, overflow, parseBudget, captureNames)

    if (!Number.isFinite(element.max)) {
      return Math.min(overflow, element.min === 0 ? elementSize + 2 : elementSize * element.min + 1)
    }

    // RE2 expands bounded repetitions rather than evaluating them as one instruction.
    return Math.max(1, Math.min(overflow, elementSize * element.max + (element.max - element.min)))
  }

  if ('alternatives' in element) {
    const size = estimateProgramSize(element.alternatives, overflow, parseBudget, captureNames)
    return element.type === 'Group' ? size : Math.min(overflow, size + 2)
  }

  if (element.type === 'CharacterClass') {
    consumeCharacterClassParseBudget(element, parseBudget)
  } else if (element.type === 'CharacterSet' && element.kind !== 'any') {
    parseBudget.remaining -= RE2_ASCII_CLASS_PARSE_COST
  }

  return 1
}

export function parsePathFilterAlternatives(source: string): AST.Alternative[] {
  return pathFilterParser.parsePattern(source).alternatives
}

export function getPathFilterAlternativeComplexity(
  alternative: AST.Alternative,
  programSizeLimit: number,
  parseCostLimit: number
): SyncPathFilterComplexity {
  const overflow = programSizeLimit + 1
  const parseBudget: SyncPathFilterParseBudget = { remaining: parseCostLimit }
  const captureNames: string[] = []
  const programSize = Math.min(overflow, estimateProgramSize([alternative], overflow, parseBudget, captureNames) + RE2_PROGRAM_OVERHEAD)

  return { programSize, parseCost: parseCostLimit - parseBudget.remaining, captureNames }
}
