import { Pipe, PipeTransform } from '@angular/core'
import { dJs } from '../utils/time'

@Pipe({ name: 'amDateFormat' })
export class TimeDateFormatPipe implements PipeTransform {
  transform(value: any, format = 'L HH:mm:ss'): string {
    if (!value) {
      return ''
    }
    return dJs(value).format(format)
  }
}
