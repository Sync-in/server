import { createCacheKeySlug, createSlug, InvalidSlugError, stripMatchingQuotes } from './shared.js'

describe(createSlug.name, () => {
  it.each([
    ['Hello world', 'hello-world'],
    ['Hello_world', 'hello-world'],
    ['Hello.world', 'hello-world'],
    ['Hello/world', 'hello-world'],
    ['Hello\\world', 'hello-world'],
    ['Équipe 東京', 'equipe-東京']
  ])('should convert %s to %s', (value, expectedValue) => {
    expect(createSlug(value)).toBe(expectedValue)
  })

  it('should remove a numeric suffix when requested', () => {
    expect(createSlug('workspace-2', true)).toBe('workspace')
  })

  it.each(['', '.', '..', '---', '___'])('should reject an empty slug generated from %s', (value) => {
    expect(() => createSlug(value)).toThrow(InvalidSlugError)
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
