import type { LocaleData } from 'ngx-bootstrap/chronos'

function ordinal(number: number): string {
  const suffix = number === 1 ? 'd' : number % 10 === 2 ? 'na' : 'mh'
  return `${number}${suffix}`
}

export const gaLocale = {
  abbr: 'ga',
  months: 'Eanáir_Feabhra_Márta_Aibreán_Bealtaine_Meitheamh_Iúil_Lúnasa_Meán Fómhair_Deireadh Fómhair_Samhain_Nollaig'.split('_'),
  monthsShort: 'Ean_Feabh_Márt_Aib_Beal_Meith_Iúil_Lún_M.F._D.F._Samh_Noll'.split('_'),
  monthsParseExact: true,
  weekdays: 'Dé Domhnaigh_Dé Luain_Dé Máirt_Dé Céadaoin_Déardaoin_Dé hAoine_Dé Sathairn'.split('_'),
  weekdaysShort: 'Domh_Luan_Máirt_Céad_Déar_Aoine_Sath'.split('_'),
  weekdaysMin: 'Do_Lu_Má_Cé_Dé_A_Sa'.split('_'),
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'DD/MM/YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY HH:mm',
    LLLL: 'dddd, D MMMM YYYY HH:mm'
  },
  calendar: {
    sameDay: '[Inniu ag] LT',
    nextDay: '[Amárach ag] LT',
    nextWeek: 'dddd [ag] LT',
    lastDay: '[Inné ag] LT',
    lastWeek: 'dddd [seo caite] [ag] LT',
    sameElse: 'L'
  },
  dayOfMonthOrdinalParse: /\d{1,2}(d|na|mh)/,
  ordinal,
  week: {
    dow: 1,
    doy: 4
  }
} satisfies LocaleData
