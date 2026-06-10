import {
  analyzeTerms,
  genRegexPositiveAndNegativeTerms,
  genTermsPattern,
  likeSearchTermStartPattern,
  MaxSortedList,
  parseSearchTerms,
  requiresLikeSearch
} from './files-search'

describe('files search utilities', () => {
  describe(MaxSortedList.name, () => {
    it('should keep the highest scores in descending order', () => {
      const list = new MaxSortedList(3)

      list.insert([2, 'second'])
      list.insert([1, 'first'])
      list.insert([4, 'fourth'])
      list.insert([3, 'third'])

      expect(list.data).toEqual([
        [4, 'fourth'],
        [3, 'third'],
        [2, 'second']
      ])
    })

    it('should ignore lower and duplicate scores when full', () => {
      const list = new MaxSortedList(2)
      list.insert([3, 'first'])
      list.insert([2, 'second'])

      list.insert([1, 'lower'])
      list.insert([2, 'duplicate'])

      expect(list.data).toEqual([
        [3, 'first'],
        [2, 'second']
      ])
    })
  })

  describe(analyzeTerms.name, () => {
    it('should return no terms for an empty or too short search', () => {
      expect(analyzeTerms('')).toEqual([])
      expect(analyzeTerms('a')).toEqual([])
    })

    it('should accept two-character CJK terms', () => {
      expect(analyzeTerms('中文')).toEqual(['中文'])
    })

    it('should separate positive and negative terms', () => {
      expect(analyzeTerms('+report -draft optional')).toEqual(['report', 'optional'])
      expect(analyzeTerms('+report -draft optional', true)).toEqual(['draft'])
    })

    it('should remove boolean modifiers and trailing wildcards', () => {
      expect(analyzeTerms('<report >draft ~lower *prefix file*')).toEqual(['report', 'draft', 'lower', 'prefix', 'file'])
    })

    it('should optionally escape regular expression characters', () => {
      expect(analyzeTerms('file.txt')).toEqual(['file\\.txt'])
      expect(analyzeTerms('file.txt', false, false)).toEqual(['file.txt'])
    })
  })

  describe(genTermsPattern.name, () => {
    it('should generate an accent-insensitive alternative pattern', () => {
      const regexp = new RegExp(`^(${genTermsPattern(['resume', 'canyon'])})$`, 'iu')

      expect(regexp.test('résumé')).toBe(true)
      expect(regexp.test('cañyon')).toBe(true)
      expect(regexp.test('other')).toBe(false)
    })
  })

  describe(genRegexPositiveAndNegativeTerms.name, () => {
    it('should match CJK terms without requiring ASCII word boundaries', () => {
      const regexp = genRegexPositiveAndNegativeTerms('日本語')

      expect(regexp.test('資料_日本語版.pdf')).toBe(true)
    })

    it('should use Unicode-aware boundaries for non-CJK terms', () => {
      const regexp = genRegexPositiveAndNegativeTerms('файл')

      expect(regexp.test('мой_файл.txt')).toBe(true)
      expect(regexp.test('суперфайл.txt')).toBe(false)
    })

    it('should exclude negative CJK terms', () => {
      const regexp = genRegexPositiveAndNegativeTerms('文書 -秘密')

      expect(regexp.test('公開文書.txt')).toBe(true)
      expect(regexp.test('秘密文書.txt')).toBe(false)
    })

    it('should exclude complete non-CJK terms without excluding partial words', () => {
      const regexp = genRegexPositiveAndNegativeTerms('report -draft')

      expect(regexp.test('report final.txt')).toBe(true)
      expect(regexp.test('report draft.txt')).toBe(false)
      expect(regexp.test('report drafting.txt')).toBe(true)
    })
  })

  describe(requiresLikeSearch.name, () => {
    it('should detect scripts requiring the LIKE fallback', () => {
      expect(requiresLikeSearch('中文')).toBe(true)
      expect(requiresLikeSearch('ภาษาไทย')).toBe(true)
      expect(requiresLikeSearch('ພາສາລາວ')).toBe(true)
      expect(requiresLikeSearch('ភាសាខ្មែរ')).toBe(true)
      expect(requiresLikeSearch('မြန်မာစာ')).toBe(true)
    })

    it('should keep space-separated scripts on FULLTEXT', () => {
      expect(requiresLikeSearch('खाते के मिलान में त्रुटि')).toBe(false)
      expect(requiresLikeSearch('русский текст')).toBe(false)
      expect(requiresLikeSearch('report')).toBe(false)
    })
  })

  describe(parseSearchTerms.name, () => {
    it('should classify boolean search terms and exact phrases', () => {
      expect(parseSearchTerms('+中文 -秘密 文档 "全文 搜索"')).toEqual([
        { value: '中文', operator: 'required' },
        { value: '秘密', operator: 'excluded' },
        { value: '文档', operator: 'optional' },
        { value: '全文 搜索', operator: 'optional' }
      ])
    })

    it('should remove nested modifiers and trailing wildcards', () => {
      expect(parseSearchTerms('++report file*')).toEqual([
        { value: 'report', operator: 'required' },
        { value: 'file', operator: 'optional' }
      ])
    })

    it('should ignore terms below the minimum length', () => {
      expect(parseSearchTerms('+a valid')).toEqual([{ value: 'valid', operator: 'optional' }])
    })
  })

  describe(likeSearchTermStartPattern.name, () => {
    it('should match only before a character requiring the LIKE fallback', () => {
      const regexp = new RegExp(`${likeSearchTermStartPattern()}.`, 'u')

      expect(regexp.test('中文')).toBe(true)
      expect(regexp.test('ภาษาไทย')).toBe(true)
      expect(regexp.test('report')).toBe(false)
    })
  })
})
