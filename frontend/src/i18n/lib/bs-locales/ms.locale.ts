import type { LocaleData } from 'ngx-bootstrap/chronos'

function meridiemHour(hour: number, meridiem: string): number {
  if (hour === 12) hour = 0
  if (meridiem === 'pagi') return hour
  if (meridiem === 'tengahari') return hour >= 11 ? hour : hour + 12
  if (meridiem === 'petang' || meridiem === 'malam') return hour + 12
  return hour
}

function meridiem(hour: number): string {
  if (hour < 11) return 'pagi'
  if (hour < 15) return 'tengahari'
  if (hour < 19) return 'petang'
  return 'malam'
}

export const msLocale = {
  abbr: 'ms',
  months: 'Januari_Februari_Mac_April_Mei_Jun_Julai_Ogos_September_Oktober_November_Disember'.split('_'),
  monthsShort: 'Jan_Feb_Mac_Apr_Mei_Jun_Jul_Ogs_Sep_Okt_Nov_Dis'.split('_'),
  weekdays: 'Ahad_Isnin_Selasa_Rabu_Khamis_Jumaat_Sabtu'.split('_'),
  weekdaysShort: 'Ahd_Isn_Sel_Rab_Kha_Jum_Sab'.split('_'),
  weekdaysMin: 'Ah_Is_Sl_Rb_Km_Jm_Sb'.split('_'),
  longDateFormat: {
    LT: 'HH.mm',
    LTS: 'HH.mm.ss',
    L: 'DD/MM/YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY [pukul] HH.mm',
    LLLL: 'dddd, D MMMM YYYY [pukul] HH.mm'
  },
  meridiemParse: /pagi|tengahari|petang|malam/,
  meridiemHour,
  meridiem,
  calendar: {
    sameDay: '[Hari ini pukul] LT',
    nextDay: '[Esok pukul] LT',
    nextWeek: 'dddd [pukul] LT',
    lastDay: '[Semalam pukul] LT',
    lastWeek: 'dddd [lepas pukul] LT',
    sameElse: 'L'
  },
  invalidDate: 'Tarikh tidak sah',
  week: {
    dow: 1,
    doy: 7
  }
} satisfies LocaleData
