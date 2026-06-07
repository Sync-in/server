import { Pipe, PipeTransform } from '@angular/core'
import { Dayjs } from 'dayjs/esm'
import { dJs } from '../utils/time'

@Pipe({ name: 'amTimeAgo', pure: true })
export class TimeAgoPipe implements PipeTransform {
  transform(value: any, omitSuffix?: boolean, formatFn?: (m: Dayjs) => string): string {
    if (!value) {
      return ''
    }

    const dayjsValue = dJs(value)

    if (!dayjsValue.isValid()) {
      return ''
    }

    return formatFn ? formatFn(dayjsValue) : dayjsValue.from(dJs(), omitSuffix)
  }
}
