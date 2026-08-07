import { Pipe, PipeTransform } from '@angular/core'
import { escapeUTF8 } from 'entities/escape'

@Pipe({ name: 'highlight' })
export class HighlightPipe implements PipeTransform {
  transform(text: string, search: string): string {
    const sourceText = text || ''
    const pattern = (search || '')
      .replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')
      .split(' ')
      .filter((term) => term.length > 0)
      .join('|')
    if (!pattern) {
      return escapeUTF8(sourceText)
    }

    return sourceText
      .split(new RegExp(`(${pattern})`, 'gi'))
      .map((part, index) => (index % 2 ? `<b>${escapeUTF8(part)}</b>` : escapeUTF8(part)))
      .join('')
  }
}
