import { Pipe, PipeTransform } from '@angular/core'
import { allSpecialCharacters } from '../utils/regexp'

@Pipe({ name: 'truncateText' })
export class TruncateTextPipe implements PipeTransform {
  transform(value: string, length: number, withEllipses = true): string {
    const ellipses = '...'
    if (typeof value === 'undefined') {
      return value
    }
    if (value.length <= length) {
      return value
    }
    if (length < ellipses.length) {
      return ''
    }

    let l = 0
    for (const w of value.replace(allSpecialCharacters, ' ').split(' ')) {
      if (l + w.length >= length) {
        break
      }
      l += w.length + 1
    }
    l -= 1
    if (l === -1) {
      l = length
    }
    return `${value.slice(0, l)}${withEllipses ? ellipses : ''}`
  }
}
