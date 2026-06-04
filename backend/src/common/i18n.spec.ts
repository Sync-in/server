import { LANG_SUPPORTED, normalizeLanguage } from './i18n'

describe('i18n', () => {
  describe('LANG_SUPPORTED', () => {
    it('should include fa (Persian)', () => {
      expect(LANG_SUPPORTED.has('fa')).toBe(true)
    })

    it('should include previously supported languages', () => {
      expect(LANG_SUPPORTED.has('en')).toBe(true)
      expect(LANG_SUPPORTED.has('de')).toBe(true)
      expect(LANG_SUPPORTED.has('fr')).toBe(true)
      expect(LANG_SUPPORTED.has('es')).toBe(true)
    })
  })

  describe('normalizeLanguage', () => {
    it('should return fa for fa language code', () => {
      expect(normalizeLanguage('fa')).toBe('fa')
    })

    it('should return fa for fa-IR language code', () => {
      expect(normalizeLanguage('fa-IR')).toBe('fa')
    })

    it('should return null for unsupported language', () => {
      expect(normalizeLanguage('xx')).toBeNull()
    })

    it('should return null for empty or null input', () => {
      expect(normalizeLanguage('')).toBeNull()
      expect(normalizeLanguage(null as any)).toBeNull()
    })

    it('should return en for en-US language code', () => {
      expect(normalizeLanguage('en-US')).toBe('en')
    })
  })
})
