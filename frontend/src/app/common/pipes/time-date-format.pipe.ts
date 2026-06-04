import { inject, Pipe, PipeTransform } from '@angular/core'
import { L10N_LOCALE, L10nLocale } from 'angular-l10n'
import { dJs } from '../utils/time'

@Pipe({ name: 'amDateFormat' })
export class TimeDateFormatPipe implements PipeTransform {
  private readonly locale = inject<L10nLocale>(L10N_LOCALE)

  transform(value: any, format = 'L HH:mm:ss'): string {
    if (!value) {
      return ''
    }
    const date = dJs(value)
    if (this.locale?.language === 'fa') {
      return date.calendar('jalali').locale('fa').format(format)
    }
    return date.format(format)
  }
}
