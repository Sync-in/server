import type { LocaleData } from 'ngx-bootstrap/chronos'

function isPM(input: string): boolean {
  return input === 'ප.ව.' || input === 'පස්වරු'
}

function meridiem(hour: number, _minute?: number, isLower?: boolean): string {
  if (hour > 11) return isLower ? 'ප.ව.' : 'පස්වරු'
  return isLower ? 'පෙ.ව.' : 'පෙරවරු'
}

export const siLocale = {
  abbr: 'si',
  months: 'ජනවාරි_පෙබරවාරි_මාර්තු_අප්‍රේල්_මැයි_ජූනි_ජූලි_අගෝස්තු_සැප්තැම්බර්_ඔක්තෝබර්_නොවැම්බර්_දෙසැම්බර්'.split('_'),
  monthsShort: 'ජන_පෙබ_මාර්_අප්_මැයි_ජූනි_ජූලි_අගෝ_සැප්_ඔක්_නොවැ_දෙසැ'.split('_'),
  weekdays: 'ඉරිදා_සඳුදා_අඟහරුවාදා_බදාදා_බ්‍රහස්පතින්දා_සිකුරාදා_සෙනසුරාදා'.split('_'),
  weekdaysShort: 'ඉරි_සඳු_අඟ_බදා_බ්‍රහ_සිකු_සෙන'.split('_'),
  weekdaysMin: 'ඉ_ස_අ_බ_බ්‍ර_සි_සෙ'.split('_'),
  weekdaysParseExact: true,
  longDateFormat: {
    LT: 'a h:mm',
    LTS: 'a h:mm:ss',
    L: 'YYYY/MM/DD',
    LL: 'YYYY MMMM D',
    LLL: 'YYYY MMMM D, a h:mm',
    LLLL: 'YYYY MMMM D [වැනි] dddd, a h:mm:ss'
  },
  calendar: {
    sameDay: '[අද] LT[ට]',
    nextDay: '[හෙට] LT[ට]',
    nextWeek: 'dddd LT[ට]',
    lastDay: '[ඊයේ] LT[ට]',
    lastWeek: '[පසුගිය] dddd LT[ට]',
    sameElse: 'L'
  },
  invalidDate: 'වලංගු නොවන දිනයකි',
  dayOfMonthOrdinalParse: /\d{1,2} වැනි/,
  ordinal(number: number): string {
    return `${number} වැනි`
  },
  meridiemParse: /පෙරවරු|පස්වරු|පෙ\.ව\.|ප\.ව\./,
  isPM,
  meridiem
} satisfies LocaleData
