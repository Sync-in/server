import { stripMatchingQuotes } from './shared'

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
