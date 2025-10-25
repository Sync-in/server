/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { i18nLocaleSupported } from '@sync-in-server/backend/src/common/interfaces'
import {
  defineLocale,
  deLocale,
  enGbLocale,
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

const BOOTSTRAP_LOCALES: Record<i18nLocaleSupported, LocaleData> = {
  de: deLocale,
  en: enGbLocale,
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
  const locale = BOOTSTRAP_LOCALES[language]
  if (!locale) return
  defineLocale(language, locale)
}
