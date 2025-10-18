/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable } from '@angular/core'
import { L10nConfig, L10nLocale, L10nStorage } from 'angular-l10n'
import 'dayjs/locale/fr'
import enLocale from './en.json'
import frLocale from './fr.json'

export const i18nAsset: any = { en: enLocale, fr: frLocale }

export const i18nLanguageText = { auto: 'Auto', en: 'English', fr: 'Français' }

export const l10nConfig: L10nConfig = {
  format: 'language',
  providers: [{ name: 'app', asset: i18nAsset }],
  fallback: false,
  cache: true,
  keySeparator: '|',
  defaultLocale: { language: 'en' },
  schema: [
    { locale: { language: 'en' }, dir: 'ltr' },
    { locale: { language: 'fr' }, dir: 'ltr' }
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

// @Injectable()
// export class TranslationLoader implements L10nTranslationLoader {
//   public get(language: string, provider: L10nProvider): Observable<{ [key: string]: any }> {
//     const data = import(`./${language}.json`)
//     console.log(data)
//     return from(data)
//   }
// }

// @Injectable()
// export class TranslationMissing implements L10nMissingTranslationHandler {
//   public handle(key: string, value?: string, params?: any): string | any {
//     console.error('translation missing: ', key, value, params)
//     return 'no translation'
//   }
// }
