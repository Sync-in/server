import type { LocaleData } from 'ngx-bootstrap/chronos'

export const swLocale = {
  abbr: 'sw',
  months: 'Januari_Februari_Machi_Aprili_Mei_Juni_Julai_Agosti_Septemba_Oktoba_Novemba_Desemba'.split('_'),
  monthsShort: 'Jan_Feb_Mac_Apr_Mei_Jun_Jul_Ago_Sep_Okt_Nov_Des'.split('_'),
  weekdays: 'Jumapili_Jumatatu_Jumanne_Jumatano_Alhamisi_Ijumaa_Jumamosi'.split('_'),
  weekdaysShort: 'Jpl_Jtat_Jnne_Jtan_Alh_Ijm_Jmos'.split('_'),
  weekdaysMin: 'J2_J3_J4_J5_Al_Ij_J1'.split('_'),
  weekdaysParseExact: true,
  longDateFormat: {
    LT: 'hh:mm A',
    LTS: 'HH:mm:ss',
    L: 'DD.MM.YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY HH:mm',
    LLLL: 'dddd, D MMMM YYYY HH:mm'
  },
  calendar: {
    sameDay: '[leo saa] LT',
    nextDay: '[kesho saa] LT',
    nextWeek: 'dddd [ijayo saa] LT',
    lastDay: '[jana] LT',
    lastWeek: 'dddd [iliyopita saa] LT',
    sameElse: 'L'
  },
  week: {
    dow: 1,
    doy: 7
  }
} satisfies LocaleData
