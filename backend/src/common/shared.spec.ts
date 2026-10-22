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
    expect(createCacheKeySlug(['SpacesQueries', 'spaces', 1, '*'])).toBe('spacesqueries:spaces:1:*')
  })

  it('should keep accented permission aliases distinct from unaccented aliases', () => {
    const accentedKey = createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'equipe', 'café'])
    const unaccentedKey = createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'equipe', 'cafe'])

    expect(accentedKey).toBe('spacesqueries:permissions:1:equipe:café')
    expect(unaccentedKey).toBe('spacesqueries:permissions:1:equipe:cafe')
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
    expect(createCacheKeySlug(['SpacesQueries', 'permissions', '*', 'ÉQUIPE', 'cafe\u0301'])).toBe('spacesqueries:permissions:*:équipe:café')
    expect(createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'équipe', '*'])).toBe('spacesqueries:permissions:1:équipe:*')
  })

  it('should keep argument boundaries distinct from hyphens in aliases', () => {
    const firstKey = createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'foo-bar', 'baz'])
    const secondKey = createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'foo', 'bar-baz'])

    expect(firstKey).toBe('spacesqueries:permissions:1:foo-bar:baz')
    expect(secondKey).toBe('spacesqueries:permissions:1:foo:bar-baz')
    expect(firstKey).not.toBe(secondKey)
  })

  it.each([null, undefined])('should distinguish a %s argument from literal null aliases', (rootAlias) => {
    const key = createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'equipe', rootAlias])

    expect(key).toBe('spacesqueries:permissions:1:equipe:~null')
    expect(key).not.toBe(createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'equipe', 'null']))
    expect(key).not.toBe(createCacheKeySlug(['SpacesQueries', 'permissions', 1, 'equipe', '~null']))
  })

  it.each([
    { firstArgs: ['foo:bar', 'baz'], secondArgs: ['foo', 'bar:baz'], expectedKey: 'foo%3Abar:baz' },
    { firstArgs: ['foo:bar'], secondArgs: ['foo%3Abar'], expectedKey: 'foo%3Abar' },
    { firstArgs: ['*'], secondArgs: ['%2A'], expectedKey: '*' },
    { firstArgs: ['~null'], secondArgs: ['%7Enull'], expectedKey: '%7Enull' }
  ])('should keep reserved characters distinct in $firstArgs and $secondArgs', ({ firstArgs, secondArgs, expectedKey }) => {
    expect(createCacheKeySlug(firstArgs)).toBe(expectedKey)
    expect(createCacheKeySlug(firstArgs)).not.toBe(createCacheKeySlug(secondArgs))
  })

  it('should escape literal asterisks while preserving whole-argument wildcards', () => {
    expect(createCacheKeySlug(['SpacesQueries', 'permissions', '*', 'foo*bar', '*'])).toBe('spacesqueries:permissions:*:foo%2Abar:*')
  })

  it('should escape quotes and backticks instead of adding them to keys', () => {
    expect(createCacheKeySlug(['"foo"', "'bar'", '\x60baz\x60'])).toBe('%22foo%22:%27bar%27:%60baz%60')
  })

  it('should preserve significant spaces, underscores and hyphens inside arguments', () => {
    expect(createCacheKeySlug([' Team_Root-- Folder '])).toBe(' team_root-- folder ')
    expect(createCacheKeySlug(['team_root'])).not.toBe(createCacheKeySlug(['team-root']))
    expect(createCacheKeySlug(['team root'])).not.toBe(createCacheKeySlug(['team-root']))
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
