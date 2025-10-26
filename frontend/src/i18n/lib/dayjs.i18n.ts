/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { i18nLocaleSupported } from '@sync-in-server/backend/src/common/i18n'
import { dJs } from '../../app/common/utils/time'

const DAYJS_LOADER: Record<i18nLocaleSupported, () => Promise<ILocale>> = {
  de: () => import('dayjs/esm/locale/de'),
  en: () => import('dayjs/esm/locale/en'),
  es: () => import('dayjs/esm/locale/es'),
  fr: () => import('dayjs/esm/locale/fr'),
  hi: () => import('dayjs/esm/locale/hi'),
  it: () => import('dayjs/esm/locale/it'),
  ja: () => import('dayjs/esm/locale/ja'),
  ko: () => import('dayjs/esm/locale/ko'),
  pl: () => import('dayjs/esm/locale/pl'),
  pt: () => import('dayjs/esm/locale/pt'),
  'pt-BR': () => import('dayjs/esm/locale/pt-br'),
  ru: () => import('dayjs/esm/locale/ru'),
  tr: () => import('dayjs/esm/locale/tr'),
  zh: () => import('dayjs/esm/locale/zh')
}

export async function loadDayjsLocale(language: string) {
  const loader = DAYJS_LOADER[language]
  if (!loader) return
  await loader()
  dJs.locale(language)
}
