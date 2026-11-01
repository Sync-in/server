import type { LocaleData } from 'ngx-bootstrap/chronos'

export const eoLocale = {
  abbr: 'eo',
  months: 'januaro_februaro_marto_aprilo_majo_junio_julio_aŭgusto_septembro_oktobro_novembro_decembro'.split('_'),
  monthsShort: 'jan_feb_mart_apr_maj_jun_jul_aŭg_sept_okt_nov_dec'.split('_'),
  weekdays: 'dimanĉo_lundo_mardo_merkredo_ĵaŭdo_vendredo_sabato'.split('_'),
  weekdaysShort: 'dim_lun_mard_merk_ĵaŭ_ven_sab'.split('_'),
  weekdaysMin: 'di_lu_ma_me_ĵa_ve_sa'.split('_'),
  meridiemParse: /[ap]\.t\.m/i,
  isPM(input: string): boolean {
    return input.charAt(0).toLowerCase() === 'p'
  },
  meridiem(hour: number, _minute?: number, isLower?: boolean): string {
    if (hour > 11) return isLower ? 'p.t.m.' : 'P.T.M.'
    return isLower ? 'a.t.m.' : 'A.T.M.'
  },
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'YYYY-MM-DD',
    LL: '[la] D[-an de] MMMM, YYYY',
    LLL: '[la] D[-an de] MMMM, YYYY HH:mm',
    LLLL: 'dddd[n], [la] D[-an de] MMMM, YYYY HH:mm'
  },
  calendar: {
    sameDay: '[Hodiaŭ je] LT',
    nextDay: '[Morgaŭ je] LT',
    nextWeek: 'dddd[n je] LT',
    lastDay: '[Hieraŭ je] LT',
    lastWeek: '[pasintan] dddd[n je] LT',
    sameElse: 'L'
  },
  invalidDate: 'Nevalida dato',
  dayOfMonthOrdinalParse: /\d{1,2}a/,
  ordinal(number: number): string {
    return `${number}a`
  },
  week: {
    dow: 1,
    doy: 7
  }
} satisfies LocaleData
