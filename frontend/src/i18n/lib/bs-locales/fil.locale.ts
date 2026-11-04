import type { LocaleData } from 'ngx-bootstrap/chronos'

export const filLocale = {
  abbr: 'fil',
  months: 'Enero_Pebrero_Marso_Abril_Mayo_Hunyo_Hulyo_Agosto_Setyembre_Oktubre_Nobyembre_Disyembre'.split('_'),
  monthsShort: 'Ene_Peb_Mar_Abr_May_Hun_Hul_Ago_Set_Okt_Nob_Dis'.split('_'),
  weekdays: 'Linggo_Lunes_Martes_Miyerkules_Huwebes_Biyernes_Sabado'.split('_'),
  weekdaysShort: 'Lin_Lun_Mar_Miy_Huw_Biy_Sab'.split('_'),
  weekdaysMin: 'Li_Lu_Ma_Mi_Hu_Bi_Sab'.split('_'),
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'MM/D/YYYY',
    LL: 'MMMM D, YYYY',
    LLL: 'MMMM D, YYYY HH:mm',
    LLLL: 'dddd, MMMM DD, YYYY HH:mm'
  },
  calendar: {
    sameDay: 'LT [ngayong araw]',
    nextDay: '[Bukas ng] LT',
    nextWeek: 'LT [sa susunod na] dddd',
    lastDay: 'LT [kahapon]',
    lastWeek: 'LT [noong nakaraang] dddd',
    sameElse: 'L'
  },
  invalidDate: 'Hindi wastong petsa',
  dayOfMonthOrdinalParse: /\d{1,2}/,
  ordinal: (number: number): string => number.toString(10),
  week: {
    dow: 1,
    doy: 4
  }
} satisfies LocaleData
