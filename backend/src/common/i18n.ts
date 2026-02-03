export const LANG_DEFAULT = 'en' as const
export type i18nLocaleSupported = 'de' | 'en' | 'es' | 'fr' | 'hi' | 'it' | 'ja' | 'ko' | 'pl' | 'pt' | 'pt-BR' | 'ru' | 'tr' | 'zh'
export const LANG_SUPPORTED = new Set<i18nLocaleSupported>(['de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pl', 'pt', 'pt-BR', 'ru', 'tr', 'zh'])
export type i18nLocale = Exclude<i18nLocaleSupported, typeof LANG_DEFAULT>

export function normalizeLanguage(language: string): i18nLocaleSupported | null {
  if (!language) return null
  if (LANG_SUPPORTED.has(language as i18nLocaleSupported)) {
    return language as i18nLocaleSupported
  }
  const code = language.split('-')[0]
  return LANG_SUPPORTED.has(code as i18nLocaleSupported) ? (code as i18nLocaleSupported) : null
}
