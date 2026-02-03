import { i18nLocaleSupported } from '@sync-in-server/backend/src/common/i18n'
import {
  defineLocale,
  deLocale,
  esLocale,
  frLocale,
  hiLocale,
  itLocale,
  jaLocale,
  koLocale,
  LocaleData,
  plLocale,
  ptBrLocale,
  ruLocale,
  trLocale,
  zhCnLocale
} from 'ngx-bootstrap/chronos'

// Remove explicit 'en' locale definition to prevent translation conflicts
const BOOTSTRAP_LOCALES: Record<Exclude<i18nLocaleSupported, 'en'>, LocaleData> = {
  de: deLocale,
  es: esLocale,
  fr: frLocale,
  hi: hiLocale,
  it: itLocale,
  ja: jaLocale,
  ko: koLocale,
  pl: plLocale,
  pt: ptBrLocale,
  'pt-BR': ptBrLocale,
  ru: ruLocale,
  tr: trLocale,
  zh: zhCnLocale
}

export function loadBootstrapLocale(language: string): void {
  const locale: LocaleData = BOOTSTRAP_LOCALES[language]
  if (!locale) return
  defineLocale(language.toLowerCase(), locale)
}
