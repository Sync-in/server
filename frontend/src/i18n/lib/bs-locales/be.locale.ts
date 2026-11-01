import type { LocaleData } from 'ngx-bootstrap/chronos'

const MONTHS_FORMAT = 'студзеня_лютага_сакавіка_красавіка_траўня_чэрвеня_ліпеня_жніўня_верасня_кастрычніка_лістапада_снежня'.split('_')
const MONTHS_STANDALONE = 'студзень_люты_сакавік_красавік_травень_чэрвень_ліпень_жнівень_верасень_кастрычнік_лістапад_снежань'.split('_')
const MONTHS_IN_FORMAT = /D[oD]?(\[[^[\]]*\]|\s)+MMMM?/

function months(date?: Date, format = '', isUTC = false): string | string[] {
  if (!date) return MONTHS_STANDALONE

  const monthIndex = isUTC ? date.getUTCMonth() : date.getMonth()
  if (format === '') return `(${MONTHS_FORMAT[monthIndex]}|${MONTHS_STANDALONE[monthIndex]})`

  return (MONTHS_IN_FORMAT.test(format) ? MONTHS_FORMAT : MONTHS_STANDALONE)[monthIndex]
}

function ordinal(number: number, period?: string): string {
  switch (period) {
    case 'M':
    case 'd':
    case 'DDD':
    case 'w':
    case 'W':
      return (number % 10 === 2 || number % 10 === 3) && number % 100 !== 12 && number % 100 !== 13 ? `${number}-і` : `${number}-ы`
    case 'D':
      return `${number}-га`
    default:
      return number.toString(10)
  }
}

export const beLocale = {
  abbr: 'be',
  months,
  monthsShort: 'студ_лют_сак_крас_трав_чэрв_ліп_жнів_вер_каст_ліст_снеж'.split('_'),
  weekdays: {
    format: 'нядзелю_панядзелак_аўторак_сераду_чацвер_пятніцу_суботу'.split('_'),
    standalone: 'нядзеля_панядзелак_аўторак_серада_чацвер_пятніца_субота'.split('_'),
    isFormat: /\[ ?[Ууў] ?(?:мінулую|наступную)? ?\] ?dddd/
  },
  weekdaysShort: 'нд_пн_ат_ср_чц_пт_сб'.split('_'),
  weekdaysMin: 'нд_пн_ат_ср_чц_пт_сб'.split('_'),
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'DD.MM.YYYY',
    LL: 'D MMMM YYYY г.',
    LLL: 'D MMMM YYYY г., HH:mm',
    LLLL: 'dddd, D MMMM YYYY г., HH:mm'
  },
  calendar: {
    sameDay: '[Сёння ў] LT',
    nextDay: '[Заўтра ў] LT',
    nextWeek: '[У] dddd [ў] LT',
    lastDay: '[Учора ў] LT',
    lastWeek(date: Date): string {
      switch (date.getDay()) {
        case 0:
        case 3:
        case 5:
        case 6:
          return '[У мінулую] dddd [ў] LT'
        default:
          return '[У мінулы] dddd [ў] LT'
      }
    },
    sameElse: 'L'
  },
  invalidDate: 'Няправільная дата',
  meridiemParse: /ночы|раніцы|дня|вечара/,
  isPM(input: string): boolean {
    return /^(дня|вечара)$/.test(input)
  },
  meridiem(hour: number): string {
    if (hour < 4) return 'ночы'
    if (hour < 12) return 'раніцы'
    if (hour < 17) return 'дня'
    return 'вечара'
  },
  dayOfMonthOrdinalParse: /\d{1,2}-(і|ы|га)/,
  ordinal,
  week: {
    dow: 1,
    doy: 7
  }
} satisfies LocaleData
