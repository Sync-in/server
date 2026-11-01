import type { LocaleData } from 'ngx-bootstrap/chronos'

export const nnLocale = {
  abbr: 'nn',
  months: 'januar_februar_mars_april_mai_juni_juli_august_september_oktober_november_desember'.split('_'),
  monthsShort: 'jan._feb._mars_apr._mai_juni_juli_aug._sep._okt._nov._des.'.split('_'),
  monthsParseExact: true,
  weekdays: 'sundag_måndag_tysdag_onsdag_torsdag_fredag_laurdag'.split('_'),
  weekdaysShort: 'su._må._ty._on._to._fr._lau.'.split('_'),
  weekdaysMin: 'su_må_ty_on_to_fr_la'.split('_'),
  weekdaysParseExact: true,
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'DD.MM.YYYY',
    LL: 'D. MMMM YYYY',
    LLL: 'D. MMMM YYYY [kl.] H:mm',
    LLLL: 'dddd D. MMMM YYYY [kl.] HH:mm'
  },
  calendar: {
    sameDay: '[I dag klokka] LT',
    nextDay: '[I morgon klokka] LT',
    nextWeek: 'dddd [klokka] LT',
    lastDay: '[I går klokka] LT',
    lastWeek: '[Føregåande] dddd [klokka] LT',
    sameElse: 'L'
  },
  dayOfMonthOrdinalParse: /\d{1,2}\./,
  ordinal: '%d.',
  week: {
    dow: 1,
    doy: 4
  }
} satisfies LocaleData
