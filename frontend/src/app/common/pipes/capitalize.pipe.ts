import { Pipe, PipeTransform } from '@angular/core'
import { capitalizeString } from '@sync-in-server/backend/src/common/shared'

@Pipe({ name: 'capitalize' })
export class CapitalizePipe implements PipeTransform {
  transform(value: any) {
    if (value) {
      return capitalizeString(value)
    }
    return value
  }
}
