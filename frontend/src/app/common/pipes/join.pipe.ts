/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { inject, Pipe, PipeTransform } from '@angular/core'
import { L10nTranslationService } from 'angular-l10n'
import { CapitalizePipe } from './capitalize.pipe'

@Pipe({ name: 'join' })
export class JoinPipe implements PipeTransform {
  private readonly translate = inject(L10nTranslationService)
  transform(input: string[], translate = false, field: string = null, separator = ', '): string {
    if (!input.length) return ''
    const arr = (field ? input.map((item: any) => item[field]) : input.concat()).sort()
    return arr.map((item) => new CapitalizePipe().transform(translate ? this.translate.translate(item) : item)).join(separator)
  }
}
