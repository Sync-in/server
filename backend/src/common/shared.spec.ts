import { createCacheKeySlug, createSlug, InvalidSlugError, stripMatchingQuotes } from './shared'

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
