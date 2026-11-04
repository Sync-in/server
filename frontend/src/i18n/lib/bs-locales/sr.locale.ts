import type { LocaleData } from 'ngx-bootstrap/chronos'

const LAST_WEEK_DAYS = [
  '[prošle] [nedelje] [u] LT',
  '[prošlog] [ponedeljka] [u] LT',
  '[prošlog] [utorka] [u] LT',
  '[prošle] [srede] [u] LT',
  '[prošlog] [četvrtka] [u] LT',
  '[prošlog] [petka] [u] LT',
  '[prošle] [subote] [u] LT'
]

export const srLocale = {
  abbr: 'sr',
  months: 'januar_februar_mart_april_maj_jun_jul_avgust_septembar_oktobar_novembar_decembar'.split('_'),
  monthsShort: 'jan._feb._mar._apr._maj_jun_jul_avg._sep._okt._nov._dec.'.split('_'),
  monthsParseExact: true,
  weekdays: 'nedelja_ponedeljak_utorak_sreda_četvrtak_petak_subota'.split('_'),
  weekdaysShort: 'ned._pon._uto._sre._čet._pet._sub.'.split('_'),
  weekdaysMin: 'ne_po_ut_sr_če_pe_su'.split('_'),
  weekdaysParseExact: true,
  longDateFormat: {
    LT: 'H:mm',
    LTS: 'H:mm:ss',
    L: 'D. M. YYYY.',
    LL: 'D. MMMM YYYY.',
    LLL: 'D. MMMM YYYY. H:mm',
    LLLL: 'dddd, D. MMMM YYYY. H:mm'
  },
  calendar: {
    sameDay: '[danas u] LT',
    nextDay: '[sutra u] LT',
    nextWeek(date: Date): string {
      switch (date.getDay()) {
        case 0:
          return '[u] [nedelju] [u] LT'
        case 3:
          return '[u] [sredu] [u] LT'
        case 6:
          return '[u] [subotu] [u] LT'
        default:
          return '[u] dddd [u] LT'
      }
    },
    lastDay: '[juče u] LT',
    lastWeek(date: Date): string {
      return LAST_WEEK_DAYS[date.getDay()]
    },
    sameElse: 'L'
  },
  invalidDate: 'Nevažeći datum',
  dayOfMonthOrdinalParse: /\d{1,2}\./,
  ordinal: '%d.',
  week: {
    dow: 1,
    doy: 7
  }
} satisfies LocaleData
