import type { LocaleData } from 'ngx-bootstrap/chronos'

function ordinal(number: number): string {
  const lastDigit = number % 10
  const lastTwoDigits = number % 100

  if (number === 0) return `${number}-ев`
  if (lastTwoDigits === 0) return `${number}-ен`
  if (lastTwoDigits > 10 && lastTwoDigits < 20) return `${number}-ти`
  if (lastDigit === 1) return `${number}-ви`
  if (lastDigit === 2) return `${number}-ри`
  if (lastDigit === 7 || lastDigit === 8) return `${number}-ми`
  return `${number}-ти`
}

export const mkLocale = {
  abbr: 'mk',
  months: 'јануари_февруари_март_април_мај_јуни_јули_август_септември_октомври_ноември_декември'.split('_'),
  monthsShort: 'јан_фев_мар_апр_мај_јун_јул_авг_сеп_окт_ное_дек'.split('_'),
  weekdays: 'недела_понеделник_вторник_среда_четврток_петок_сабота'.split('_'),
  weekdaysShort: 'нед_пон_вто_сре_чет_пет_саб'.split('_'),
  weekdaysMin: 'не_по_вт_ср_че_пе_са'.split('_'),
  longDateFormat: {
    LT: 'H:mm',
    LTS: 'H:mm:ss',
    L: 'D.MM.YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY H:mm',
    LLLL: 'dddd, D MMMM YYYY H:mm'
  },
  calendar: {
    sameDay: '[Денес во] LT',
    nextDay: '[Утре во] LT',
    nextWeek: '[Во] dddd [во] LT',
    lastDay: '[Вчера во] LT',
    lastWeek(date: Date): string {
      switch (date.getDay()) {
        case 0:
        case 3:
        case 6:
          return '[Изминатата] dddd [во] LT'
        default:
          return '[Изминатиот] dddd [во] LT'
      }
    },
    sameElse: 'L'
  },
  invalidDate: 'Невалиден датум',
  dayOfMonthOrdinalParse: /\d{1,2}-(ев|ен|ти|ви|ри|ми)/,
  ordinal,
  week: {
    dow: 1,
    doy: 7
  }
} satisfies LocaleData
