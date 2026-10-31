import { userPreferencesSchema } from './user-properties.dto.js'

describe('userPreferencesSchema', () => {
  it('accepts only boolean values for the single-click preference', () => {
    expect(userPreferencesSchema.parse({ singleClickNavigation: true })).toEqual({ singleClickNavigation: true })
    expect(userPreferencesSchema.parse({})).toEqual({})
    expect(userPreferencesSchema.safeParse({ singleClickNavigation: 'true' }).success).toBe(false)
  })
})
