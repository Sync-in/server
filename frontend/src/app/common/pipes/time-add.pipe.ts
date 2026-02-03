import { Pipe, PipeTransform } from '@angular/core'
import { dJs } from '../utils/time'

@Pipe({ name: 'amAdd' })
export class TimeAddPipe implements PipeTransform {
  transform(value: any, amount: any, unit?: any): any {
    if (typeof amount === 'undefined' || (typeof amount === 'number' && typeof unit === 'undefined')) {
      throw new Error('TimeAddPipe: missing required arguments')
    }
    return dJs(value).add(amount, unit)
  }
}
