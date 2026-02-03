import { Pipe, PipeTransform } from '@angular/core'
import { convertBytesToText } from '../utils/functions'

@Pipe({ name: 'toBytes' })
export class ToBytesPipe implements PipeTransform {
  transform(bytes: number, precision = 0, zero = false): string {
    return convertBytesToText(bytes, precision, zero)
  }
}
