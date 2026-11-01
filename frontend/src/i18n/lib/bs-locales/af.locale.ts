import type { LocaleData } from 'ngx-bootstrap/chronos'

export const afLocale = {
  abbr: 'af',
  months: 'Januarie_Februarie_Maart_April_Mei_Junie_Julie_Augustus_September_Oktober_November_Desember'.split('_'),
  monthsShort: 'Jan_Feb_Mrt_Apr_Mei_Jun_Jul_Aug_Sep_Okt_Nov_Des'.split('_'),
  weekdays: 'Sondag_Maandag_Dinsdag_Woensdag_Donderdag_Vrydag_Saterdag'.split('_'),
  weekdaysShort: 'Son_Maa_Din_Woe_Don_Vry_Sat'.split('_'),
  weekdaysMin: 'So_Ma_Di_Wo_Do_Vr_Sa'.split('_'),
  meridiemParse: /vm|nm/i,
  isPM(input: string): boolean {
    return /^nm$/i.test(input)
  },
  meridiem(hour: number, _minute?: number, isLower?: boolean): string {
    if (hour < 12) return isLower ? 'vm' : 'VM'
    return isLower ? 'nm' : 'NM'
  },
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'DD/MM/YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY HH:mm',
    LLLL: 'dddd, D MMMM YYYY HH:mm'
  },
  calendar: {
    sameDay: '[Vandag om] LT',
    nextDay: '[Môre om] LT',
    nextWeek: 'dddd [om] LT',
    lastDay: '[Gister om] LT',
    lastWeek: '[Laas] dddd [om] LT',
    sameElse: 'L'
  },
  invalidDate: 'Ongeldige datum',
  dayOfMonthOrdinalParse: /\d{1,2}(ste|de)/,
  ordinal(number: number): string {
    return `${number}${number === 1 || number === 8 || number >= 20 ? 'ste' : 'de'}`
  },
  week: {
    dow: 1,
    doy: 4
  }
} satisfies LocaleData
