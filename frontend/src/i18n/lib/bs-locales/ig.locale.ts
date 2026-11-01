import type { LocaleData } from 'ngx-bootstrap/chronos'

function isPM(input: string): boolean {
  return input === 'N’abalị' || input === 'N’abali'
}

function meridiem(hour: number): string {
  return hour < 12 ? 'N’ụtụtụ' : 'N’abalị'
}

export const igLocale = {
  abbr: 'ig',
  months: 'Jenụwarị_Febrụwarị_Maachị_Epreel_Mee_Jun_Julaị_Ọgọọst_Septemba_Ọktoba_Novemba_Disemba'.split('_'),
  monthsShort: 'Jen_Feb_Maa_Epr_Mee_Juu_Jul_Ọgọ_Sep_Ọkt_Nov_Dis'.split('_'),
  weekdays: 'Sọndee_Mọnde_Tiuzdee_Wenezdee_Tọọzdee_Fraịdee_Satọdee'.split('_'),
  weekdaysShort: 'Sọn_Mọn_Tiu_Wen_Tọọ_Fraị_Sat'.split('_'),
  weekdaysMin: 'S_M_T_W_T_F_S'.split('_'),
  weekdaysParseExact: true,
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'D/M/YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY HH:mm',
    LLLL: 'dddd, D MMMM YYYY HH:mm'
  },
  calendar: {
    sameDay: '[Taa na] LT',
    nextDay: '[Echi na] LT',
    nextWeek: 'dddd [na-abịa na] LT',
    lastDay: '[Ụnyaahụ na] LT',
    lastWeek: 'dddd [gara aga na] LT',
    sameElse: 'L'
  },
  invalidDate: 'Ụbọchị adịghị irè',
  dayOfMonthOrdinalParse: /\d{1,2}/,
  ordinal(number: number): string {
    return `${number}`
  },
  meridiemParse: /N’ụtụtụ|N’abalị|N’abali/,
  isPM,
  meridiem,
  week: {
    dow: 1,
    doy: 7
  }
} satisfies LocaleData
