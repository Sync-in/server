/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { inject, Injectable } from '@angular/core'
import {
  getBrowserLanguage,
  L10N_LOCALE,
  L10nConfig,
  L10nFormat,
  L10nLocale,
  L10nMissingTranslationHandler,
  L10nStorage,
  L10nTranslationLoader
} from 'angular-l10n'
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
  plLocale,
  ptBrLocale,
  ruLocale,
  trLocale,
  zhCnLocale
} from 'ngx-bootstrap/chronos'
import { BsLocaleService } from 'ngx-bootstrap/datepicker'
import { from, Observable, of } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import 'dayjs/esm/locale/de'
import 'dayjs/esm/locale/en'
import 'dayjs/esm/locale/es'
import 'dayjs/esm/locale/fr'
import 'dayjs/esm/locale/hi'
import 'dayjs/esm/locale/it'
import 'dayjs/esm/locale/ja'
import 'dayjs/esm/locale/ko'
import 'dayjs/esm/locale/pl'
import 'dayjs/esm/locale/pt'
import 'dayjs/esm/locale/pt-br'
import 'dayjs/esm/locale/ru'
import 'dayjs/esm/locale/tr'
import 'dayjs/esm/locale/zh'
import { USER_LANGUAGE_AUTO } from '../app/applications/users/user.constants'
import { dJs } from '../app/common/utils/time'

// BOOTSTRAP LOCALES
defineLocale('de', deLocale)
defineLocale('en', enGbLocale)
defineLocale('es', esLocale)
defineLocale('fr', frLocale)
defineLocale('hi', hiLocale)
defineLocale('it', itLocale)
defineLocale('ja', jaLocale)
defineLocale('ko', koLocale)
defineLocale('pl', plLocale)
defineLocale('pt', ptBrLocale)
defineLocale('pt-br', ptBrLocale)
defineLocale('ru', ruLocale)
defineLocale('tr', trLocale)
defineLocale('zh', zhCnLocale)

export const LANG_FORMAT: L10nFormat = 'language-region' as const
export const STORAGE_SESSION_KEY = 'locale' as const

export const i18nLanguageText = {
  [USER_LANGUAGE_AUTO]: 'Auto',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  hi: 'हिन्दी',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  pl: 'Polski',
  pt: 'Português',
  'pt-BR': 'Português (Brasil)',
  ru: 'Русский',
  tr: 'Türkçe',
  zh: '中文（简体) '
}

export const l10nConfig: L10nConfig = {
  format: LANG_FORMAT,
  // Provider without static asset: resources will be loaded through TranslationLoader
  providers: [{ name: 'app', asset: 'app' }],
  fallback: false,
  cache: true,
  keySeparator: '|',
  defaultLocale: { language: 'en' },
  schema: [
    { locale: { language: 'de' }, dir: 'ltr' },
    { locale: { language: 'en' }, dir: 'ltr' },
    { locale: { language: 'es' }, dir: 'ltr' },
    { locale: { language: 'fr' }, dir: 'ltr' },
    { locale: { language: 'hi' }, dir: 'ltr' },
    { locale: { language: 'it' }, dir: 'ltr' },
    { locale: { language: 'ja' }, dir: 'ltr' },
    { locale: { language: 'ko' }, dir: 'ltr' },
    { locale: { language: 'pl' }, dir: 'ltr' },
    { locale: { language: 'pt' }, dir: 'ltr' },
    { locale: { language: 'pt-BR' }, dir: 'ltr' },
    { locale: { language: 'ru' }, dir: 'ltr' },
    { locale: { language: 'tr' }, dir: 'ltr' },
    { locale: { language: 'zh' }, dir: 'ltr' }
  ]
}

export function getL10nLocale(): L10nLocale {
  return { language: getBrowserLanguage(LANG_FORMAT) }
}

@Injectable({ providedIn: 'root' })
export class TranslationStorage implements L10nStorage {
  private readonly hasStorage = typeof Storage !== 'undefined'

  public async read(): Promise<L10nLocale | null> {
    if (!this.hasStorage) {
      return getL10nLocale()
    }
    let stored: L10nLocale | null = null
    const raw = sessionStorage.getItem(STORAGE_SESSION_KEY)
    if (raw) {
      try {
        stored = JSON.parse(raw)
      } catch (e) {
        console.warn('Invalid locale in sessionStorage, resetting.', e)
        sessionStorage.removeItem(STORAGE_SESSION_KEY)
      }
    }
    const lang = stored?.language
    const isSupported = !!lang && Object.hasOwn(i18nLanguageText, lang)
    if (!isSupported) {
      sessionStorage.removeItem(STORAGE_SESSION_KEY)
      return getL10nLocale()
    }
    return stored
  }

  public async write(locale: L10nLocale): Promise<void> {
    if (!this.hasStorage) return
    try {
      const value = JSON.stringify(locale)
      sessionStorage.setItem(STORAGE_SESSION_KEY, value)
    } catch (e) {
      console.warn('Failed to write locale to sessionStorage:', e)
    }
  }
}

@Injectable()
export class TranslationLoader implements L10nTranslationLoader {
  private readonly bsLocale = inject(BsLocaleService)

  get(language: string): Observable<Record<string, any>> {
    if (!Object.hasOwn(i18nLanguageText, language)) {
      language = language.split('-')[0]
    }
    if (Object.hasOwn(i18nLanguageText, language)) {
      dJs.locale(language)
      this.bsLocale.use(language)
    } else {
      return of({})
    }
    // Dynamically load the JSON file for the requested language
    return from(import(`./${language}.json`)).pipe(
      map((module: any) => module?.default ?? module ?? {}),
      catchError(() => of({}))
    )
  }
}

@Injectable()
export class TranslationMissing implements L10nMissingTranslationHandler {
  protected locale = inject<L10nLocale>(L10N_LOCALE)

  public handle(key: string, value?: string, params?: any): string {
    // Log missing translations and return the key by default to make it easier to spot during development
    if (this.locale.language.startsWith('en')) {
      // Skip missing-translation logs for English since it's the default language
      return key
    }
    console.error('translation missing: ', key, value, params, this.locale)
    return key ?? 'no translation'
  }
}
