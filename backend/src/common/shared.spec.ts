import { createCacheKeySlug, createLightSlug, createSlug, InvalidSlugError, stripMatchingQuotes } from './shared.js'

describe(createSlug.name, () => {
  it.each([
    ['Hello world', 'hello-world'],
    ['Hello_world', 'hello-world'],
    ['Hello.world', 'hello-world'],
    ['Hello/world', 'hello-world'],
    ['Hello\\world', 'hello-world'],
    ['Équipe 東京', 'equipe-東京'],
    ['foo\ufe0f', 'foo'],
    ['foo\ufe0fbar', 'foo-bar'],
    ['ﬃ'.repeat(86), 'ﬃ'.repeat(86)],
    ['ＦＯＯ １２３', 'ｆｏｏ-１２３'],
    ['İ I ı', 'i-i-ı'],
    ['\u0301東京 / \u093f hello', '東京-hello'],
    ['कि', 'क'],
    ['قُرْآن', 'ق-ر-ا-ن'],
    ['Équipe (Paris)', 'equipe-paris'],
    ['Équipe (Paris) + 東京', 'equipe-paris-東京'],
    ['Rapport n°42', 'rapport-n-42'],
    ['Photos 📷', 'photos'],
    ['  Team__Root--- Folder  ', 'team-root-folder']
  ])('should convert %s to %s', (value, expectedValue) => {
    expect(createSlug(value)).toBe(expectedValue)
    expect(createSlug(expectedValue)).toBe(expectedValue)
  })

  it.each([
    ['cafe\u0301', 'café', 'cafe'],
    ['か\u3099', 'が', 'か'],
    ['\u1100\u1161', '가', '\u1100\u1161']
  ])('should normalize %s and %s to the same alias', (decomposed, composed, expectedValue) => {
    expect(createSlug(decomposed)).toBe(expectedValue)
    expect(createSlug(composed)).toBe(expectedValue)
  })

  it.each([
    ['\u200chello\u200d', 'hello'],
    ['hello\u200cworld', 'hello-world'],
    ['1\u200d2', '1-2'],
    ['क्\u200d\u200dष', 'क-ष'],
    ['\ufe0f東京', '東京']
  ])('should treat join controls and variation selectors as separators in %s', (value, expectedValue) => {
    expect(createSlug(value)).toBe(expectedValue)
  })

  it.each([
    '.',
    '/',
    '\\',
    ':',
    '*',
    '?',
    '"',
    '<',
    '>',
    '|',
    '#',
    '%',
    ';',
    '(',
    ')',
    '+',
    '\u0000',
    '\u001f',
    '\u007f',
    '\u009f',
    '\u202e',
    '\ud800',
    '\udfff'
  ])('should separate Unicode words around %j', (character) => {
    expect(createSlug(`Équipe${character}Paris`)).toBe('equipe-paris')
  })

  it('should remove a numeric suffix when requested', () => {
    expect(createSlug('workspace-2', true)).toBe('workspace')
  })

  it.each(['', '.', '..', '---', '___', '📷', '\u0301', '\u093f', '\u180b', '\u{e0100}', '\u200c\u200d'])(
    'should reject a slug without any letters or numbers generated from %s',
    (value) => {
      expect(() => createSlug(value)).toThrow(InvalidSlugError)
    }
  )
})

describe(createLightSlug.name, () => {
  it('should keep removing accents for authentication and application-password names', () => {
    expect(createLightSlug(' ÉQUIPE CAFÉ ')).toBe('equipe cafe')
  })
})

describe(createCacheKeySlug.name, () => {
  it('should preserve cache pattern metacharacters', () => {
    expect(createCacheKeySlug(['SpacesQueries', 'spaces', 1, '*'])).toBe('spacesqueries-spaces-1-*')
  })

  it('should keep accented permission aliases distinct from unaccented aliases', () => {
    const accentedKey = createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'equipe', 'café'])
    const unaccentedKey = createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'equipe', 'cafe'])

    expect(accentedKey).toBe('spacesqueries-permissions-1-equipe-café')
    expect(unaccentedKey).toBe('spacesqueries-permissions-1-equipe-cafe')
    expect(accentedKey).not.toBe(unaccentedKey)
  })

  it('should normalize NFC and NFD aliases to the same cache key', () => {
    expect(createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'équipe', 'cafe\u0301'])).toBe(
      createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'e\u0301quipe', 'café'])
    )
  })

  it('should remain case insensitive while preserving accents', () => {
    expect(createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'ÉQUIPE', 'CAFÉ'])).toBe(
      createCacheKeySlug(['spacesqueries', 'permissions', 1, 'équipe', 'café'])
    )
  })

  it('should preserve accented aliases and wildcards in permission invalidation patterns', () => {
    expect(createCacheKeySlug(['SpacesQueries', 'permissions', '*', 'ÉQUIPE', 'cafe\u0301'])).toBe('spacesqueries-permissions-*-équipe-café')
    expect(createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'équipe', '*'])).toBe('spacesqueries-permissions-1-équipe-*')
  })

  it.each([null, undefined])('should preserve the existing ASCII format for a %s argument', (rootAlias) => {
    expect(createCacheKeySlug([' SpacesQueries ', 'Permissions', 1, 'Team_Root-- Folder', rootAlias])).toBe(
      'spacesqueries-permissions-1-team-root-folder-null'
    )
  })
})

describe(stripMatchingQuotes.name, () => {
  it.each([
    ['value', 'value'],
    ['"value"', 'value'],
    ["'value'", 'value'],
    [`"'value'"`, "'value'"],
    [`"value'`, `"value'`]
  ])('should convert %s to %s', (value, expectedValue) => {
    expect(stripMatchingQuotes(value)).toBe(expectedValue)
  })
})
