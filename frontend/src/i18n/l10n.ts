/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { inject, Injectable } from '@angular/core'
import { i18nLocaleSupported, LANG_SUPPORTED, normalizeLanguage } from '@sync-in-server/backend/src/common/i18n'
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
import { BsLocaleService } from 'ngx-bootstrap/datepicker'
import { from, Observable, of } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import { USER_LANGUAGE_AUTO } from '../app/applications/users/user.constants'
import { loadBootstrapLocale } from './lib/bs.i18n'
import { loadDayjsLocale } from './lib/dayjs.i18n'

export const LANG_FORMAT: L10nFormat = 'language-region' as const
export const STORAGE_SESSION_KEY = 'locale' as const
export const LANG_DEFAULT: i18nLocaleSupported = 'en'

export const i18nLanguageText: Record<i18nLocaleSupported | typeof USER_LANGUAGE_AUTO, string> = {
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

export const l10nConfig: L10nConfig & {
  schema: { locale: { language: i18nLocaleSupported }; dir: 'ltr' | 'rtl' }[]
} = {
  format: LANG_FORMAT,
  // Provider without static asset: resources will be loaded through TranslationLoader
  providers: [{ name: 'app', asset: 'app' }],
  fallback: false,
  cache: true,
  keySeparator: '|',
  defaultLocale: { language: LANG_DEFAULT },
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

export function getBrowserL10nLocale(): L10nLocale {
  return { language: normalizeLanguage(getBrowserLanguage(LANG_FORMAT)) }
}

@Injectable({ providedIn: 'root' })
export class TranslationStorage implements L10nStorage {
  private readonly hasStorage = typeof Storage !== 'undefined'

  async read(): Promise<L10nLocale | null> {
    if (!this.hasStorage) {
      return getBrowserL10nLocale()
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
    const isSupported = !!lang && LANG_SUPPORTED.has(lang as i18nLocaleSupported)
    if (!isSupported) {
      sessionStorage.removeItem(STORAGE_SESSION_KEY)
      return getBrowserL10nLocale()
    }
    return stored
  }

  async write(locale: L10nLocale): Promise<void> {
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
    if (language && LANG_SUPPORTED.has(language as i18nLocaleSupported)) {
      loadDayjsLocale(language).catch(console.error)
      loadBootstrapLocale(language)
      this.bsLocale.use(language.toLowerCase())
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
    if (this.locale.language.startsWith(LANG_DEFAULT)) {
      // Skip missing-translation logs for English since it's the default language
      return key
    }
    console.error('translation missing: ', key, value, params, this.locale)
    return key ?? 'no translation'
  }
}
