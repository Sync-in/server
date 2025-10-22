/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable } from '@angular/core'
import { L10nConfig, L10nLocale, L10nMissingTranslationHandler, L10nStorage, L10nTranslationLoader } from 'angular-l10n'
import { from, Observable, of } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import 'dayjs/locale/fr'
import 'dayjs/locale/de.js'
import 'dayjs/locale/es.js'
import 'dayjs/locale/pt.js'
import 'dayjs/locale/it.js'
import 'dayjs/locale/zh.js'
import 'dayjs/locale/hi.js'
import 'dayjs/locale/ru.js'
import { USER_LANGUAGE_AUTO } from '../app/applications/users/user.constants'

export const i18nLanguageText = {
  [USER_LANGUAGE_AUTO]: 'Auto',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
  zh: '中文 (简体)',
  hi: 'हिन्दी',
  ru: 'Русский'
}

export const l10nConfig: L10nConfig = {
  format: 'language',
  // Provider without static asset: resources will be loaded through TranslationLoader
  providers: [{ name: 'app', asset: 'app' }],
  fallback: false,
  cache: true,
  keySeparator: '|',
  defaultLocale: { language: 'en' },
  schema: [
    { locale: { language: 'en' }, dir: 'ltr' },
    { locale: { language: 'fr' }, dir: 'ltr' },
    { locale: { language: 'de' }, dir: 'ltr' },
    { locale: { language: 'es' }, dir: 'ltr' },
    { locale: { language: 'it' }, dir: 'ltr' },
    { locale: { language: 'pt' }, dir: 'ltr' },
    { locale: { language: 'hi' }, dir: 'ltr' },
    { locale: { language: 'zh' }, dir: 'ltr' },
    { locale: { language: 'ru' }, dir: 'ltr' }
  ]
}

@Injectable({ providedIn: 'root' })
export class TranslationStorage implements L10nStorage {
  hasStorage: boolean

  constructor() {
    this.hasStorage = typeof Storage !== 'undefined'
  }

  public async read(): Promise<L10nLocale | null> {
    if (this.hasStorage) {
      const locale = sessionStorage.getItem('locale')
      return Promise.resolve(locale ? JSON.parse(locale) : locale)
    }
    return Promise.resolve(null)
  }

  public async write(locale: L10nLocale): Promise<void> {
    if (this.hasStorage) {
      sessionStorage.setItem('locale', JSON.stringify(locale))
    }
  }
}

@Injectable()
export class TranslationLoader implements L10nTranslationLoader {
  public get(language: string): Observable<Record<string, any>> {
    // Dynamically load the JSON file for the requested language
    return from(import(`./${language}.json`)).pipe(
      map((module: any) => module?.default ?? module ?? {}),
      catchError(() => of({}))
    )
  }
}

@Injectable()
export class TranslationMissing implements L10nMissingTranslationHandler {
  public handle(key: string, value?: string, params?: any): string | any {
    // Log missing translations and return the key by default
    // to make it easier to spot during development
    console.error('translation missing: ', key, value, params)
    return key ?? 'no translation'
  }
}
