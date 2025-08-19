/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Pipe, PipeTransform, inject } from '@angular/core'
import { L10nTranslationService } from 'angular-l10n'

@Pipe({ name: 'joinCounts' })
export class JoinCountsPipe implements PipeTransform {
  private readonly translate = inject(L10nTranslationService)
  transform(input: Record<string, number>, ignoreKeys: string[] = []): string {
    let output = ''
    if (!input) return output
    for (const [k, v] of Object.entries(input).filter(([k, _]) => ignoreKeys.indexOf(k) === -1)) {
      if (v) {
        output += `${v} ${this.translate.translate(v === 1 ? k.slice(0, -1) : k)}, `
      }
    }
    return output.slice(0, -2)
  }
}
