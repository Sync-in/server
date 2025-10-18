/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, inject } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { FaConfig } from '@fortawesome/angular-fontawesome'
import { L10N_LOCALE, L10nLoader, L10nLocale } from 'angular-l10n'
import { defineLocale, deLocale, enGbLocale, esLocale, frLocale, hiLocale, itLocale, ptBrLocale, zhCnLocale } from 'ngx-bootstrap/chronos'
import { BsLocaleService } from 'ngx-bootstrap/datepicker'
import { setTheme } from 'ngx-bootstrap/utils'
import { dJs } from './common/utils/time'

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>'
})
export class AppComponent {
  private locale = inject<L10nLocale>(L10N_LOCALE)
  private l10nLoader = inject(L10nLoader)
  private bsLocaleService = inject(BsLocaleService)

  constructor() {
    const faConfig = inject(FaConfig)

    faConfig.fixedWidth = true
    setTheme('bs5')
    defineLocale('en', enGbLocale)
    defineLocale('fr', frLocale)
    defineLocale('de', deLocale)
    defineLocale('es', esLocale)
    defineLocale('pt', ptBrLocale)
    defineLocale('it', itLocale)
    defineLocale('zh', zhCnLocale)
    defineLocale('hi', hiLocale)
    this.l10nLoader.init().then(() => {
      dJs.locale(this.locale.language)
      this.bsLocaleService.use(this.locale.language)
    })
  }
}
