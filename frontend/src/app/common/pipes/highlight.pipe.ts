/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Pipe, PipeTransform } from '@angular/core'

@Pipe({ name: 'highlight' })
export class HighlightPipe implements PipeTransform {
  transform(text: string, search: string, reset = false): string {
    if (reset && search.length < 1) {
      return text
    }
    if (search && text) {
      let pattern = search.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')
      pattern = pattern
        .split(' ')
        .filter((t) => t.length > 0)
        .join('|')
      const regex = new RegExp(pattern, 'gi')
      return text.replace(regex, (match) => `<b>${match}</b>`)
    } else {
      return text
    }
  }
}
