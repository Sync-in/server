import { Pipe, PipeTransform } from '@angular/core'
import { dJs } from '../utils/time'

@Pipe({ name: 'amDuration', pure: false })
export class TimeDurationPipe implements PipeTransform {
  transform(value: any, unit: string): string {
    if (!unit) {
      throw new Error('TimeDurationPipe: missing required time unit argument')
    }
    return dJs.duration({ [unit]: value }).humanize()
  }
}
