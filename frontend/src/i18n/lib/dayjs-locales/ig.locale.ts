import dayjs from 'dayjs/esm'

const locale = {
  name: 'ig',
  weekdays: 'Sọndee_Mọnde_Tiuzdee_Wenezdee_Tọọzdee_Fraịdee_Satọdee'.split('_'),
  months: 'Jenụwarị_Febrụwarị_Maachị_Epreel_Mee_Jun_Julaị_Ọgọọst_Septemba_Ọktoba_Novemba_Disemba'.split('_'),
  weekStart: 1,
  yearStart: 1,
  weekdaysShort: 'Sọn_Mọn_Tiu_Wen_Tọọ_Fraị_Sat'.split('_'),
  monthsShort: 'Jen_Feb_Maa_Epr_Mee_Juu_Jul_Ọgọ_Sep_Ọkt_Nov_Dis'.split('_'),
  weekdaysMin: 'S_M_T_W_T_F_S'.split('_'),
  ordinal(number: number): number {
    return number
  },
  formats: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'D/M/YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY HH:mm',
    LLLL: 'dddd, D MMMM YYYY HH:mm'
  },
  relativeTime: {
    future: 'n’ime %s',
    past: '%s gara aga',
    s: 'sekọnd ole na ole',
    ss: 'sekọnd %d',
    m: 'otu nkeji',
    mm: 'nkeji %d',
    h: 'otu awa',
    hh: 'awa %d',
    d: 'otu ụbọchị',
    dd: 'ụbọchị %d',
    M: 'otu ọnwa',
    MM: 'ọnwa %d',
    y: 'otu afọ',
    yy: 'afọ %d'
  },
  meridiemParse: /N’ụtụtụ|N’abalị|N’abali/,
  isPM(input: string): boolean {
    return input === 'N’abalị' || input === 'N’abali'
  },
  meridiem(hour: number): string {
    return hour < 12 ? 'N’ụtụtụ' : 'N’abalị'
  }
}

dayjs.locale(locale, null, true)

export default locale
