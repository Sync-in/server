import type { LocaleData } from 'ngx-bootstrap/chronos'

const MONTHS_NOMINATIVE = 'Ιανουάριος_Φεβρουάριος_Μάρτιος_Απρίλιος_Μάιος_Ιούνιος_Ιούλιος_Αύγουστος_Σεπτέμβριος_Οκτώβριος_Νοέμβριος_Δεκέμβριος'.split(
  '_'
)
const MONTHS_GENITIVE = 'Ιανουαρίου_Φεβρουαρίου_Μαρτίου_Απριλίου_Μαΐου_Ιουνίου_Ιουλίου_Αυγούστου_Σεπτεμβρίου_Οκτωβρίου_Νοεμβρίου_Δεκεμβρίου'.split(
  '_'
)

function months(date?: Date, format = '', isUTC = false): string | string[] {
  if (!date) return MONTHS_NOMINATIVE

  const monthIndex = isUTC ? date.getUTCMonth() : date.getMonth()
  if (format === '') return `(${MONTHS_GENITIVE[monthIndex]}|${MONTHS_NOMINATIVE[monthIndex]})`

  return (format.indexOf('MMMM') >= 0 && /D/.test(format.slice(0, format.indexOf('MMMM'))) ? MONTHS_GENITIVE : MONTHS_NOMINATIVE)[monthIndex]
}

function timePreposition(date: Date): string {
  return date.getHours() % 12 === 1 ? 'στη' : 'στις'
}

export const elLocale = {
  abbr: 'el',
  months,
  monthsShort: 'Ιαν_Φεβ_Μαρ_Απρ_Μαϊ_Ιουν_Ιουλ_Αυγ_Σεπ_Οκτ_Νοε_Δεκ'.split('_'),
  weekdays: 'Κυριακή_Δευτέρα_Τρίτη_Τετάρτη_Πέμπτη_Παρασκευή_Σάββατο'.split('_'),
  weekdaysShort: 'Κυρ_Δευ_Τρι_Τετ_Πεμ_Παρ_Σαβ'.split('_'),
  weekdaysMin: 'Κυ_Δε_Τρ_Τε_Πε_Πα_Σα'.split('_'),
  meridiem(hours: number, _minutes?: number, isLower?: boolean): string {
    if (hours > 11) return isLower ? 'μμ' : 'ΜΜ'
    return isLower ? 'πμ' : 'ΠΜ'
  },
  isPM(input: string): boolean {
    return input.toLowerCase().charAt(0) === 'μ'
  },
  meridiemParse: /[ΠΜ]\.?Μ?\.?/i,
  longDateFormat: {
    LT: 'h:mm A',
    LTS: 'h:mm:ss A',
    L: 'DD/MM/YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY h:mm A',
    LLLL: 'dddd, D MMMM YYYY h:mm A'
  },
  calendar: {
    sameDay: (date: Date): string => `[Σήμερα ${timePreposition(date)}] LT`,
    nextDay: (date: Date): string => `[Αύριο ${timePreposition(date)}] LT`,
    nextWeek: (date: Date): string => `dddd [${timePreposition(date)}] LT`,
    lastDay: (date: Date): string => `[Χθες ${timePreposition(date)}] LT`,
    lastWeek: (date: Date): string => `${date.getDay() === 6 ? '[το προηγούμενο]' : '[την προηγούμενη]'} dddd [${timePreposition(date)}] LT`,
    sameElse: 'L'
  },
  invalidDate: 'Μη έγκυρη ημερομηνία',
  dayOfMonthOrdinalParse: /\d{1,2}η/,
  ordinal: '%dη',
  week: {
    dow: 1,
    doy: 4
  }
} satisfies LocaleData
