import type { LocaleData } from 'ngx-bootstrap/chronos'

export const bsLocale = {
  abbr: 'bs',
  months: 'januar_februar_mart_april_maj_juni_juli_august_septembar_oktobar_novembar_decembar'.split('_'),
  monthsShort: 'jan._feb._mar._apr._maj._jun._jul._aug._sep._okt._nov._dec.'.split('_'),
  monthsParseExact: true,
  weekdays: 'nedjelja_ponedjeljak_utorak_srijeda_četvrtak_petak_subota'.split('_'),
  weekdaysShort: 'ned._pon._uto._sri._čet._pet._sub.'.split('_'),
  weekdaysMin: 'ne_po_ut_sr_če_pe_su'.split('_'),
  weekdaysParseExact: true,
  longDateFormat: {
    LT: 'H:mm',
    LTS: 'H:mm:ss',
    L: 'DD.MM.YYYY',
    LL: 'D. MMMM YYYY',
    LLL: 'D. MMMM YYYY H:mm',
    LLLL: 'dddd, D. MMMM YYYY H:mm'
  },
  calendar: {
    sameDay: '[danas u] LT',
    nextDay: '[sutra u] LT',
    nextWeek(date: Date): string {
      switch (date.getDay()) {
        case 0:
          return '[u] [nedjelju] [u] LT'
        case 3:
          return '[u] [srijedu] [u] LT'
        case 6:
          return '[u] [subotu] [u] LT'
        default:
          return '[u] dddd [u] LT'
      }
    },
    lastDay: '[jučer u] LT',
    lastWeek(date: Date): string {
      switch (date.getDay()) {
        case 0:
        case 3:
          return '[prošlu] dddd [u] LT'
        case 6:
          return '[prošle] [subote] [u] LT'
        default:
          return '[prošli] dddd [u] LT'
      }
    },
    sameElse: 'L'
  },
  invalidDate: 'Neispravan datum',
  dayOfMonthOrdinalParse: /\d{1,2}\./,
  ordinal: '%d.',
  week: {
    dow: 1,
    doy: 7
  }
} satisfies LocaleData
