import { searchMembersSchema } from './search-members.dto.js'

describe('searchMembersSchema', () => {
  it('normalizes a null search to an empty string', () => {
    expect(searchMembersSchema.parse({ search: null })).toEqual(expect.objectContaining({ search: '' }))
  })
})
