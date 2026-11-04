import type { LocaleData } from 'ngx-bootstrap/chronos'

const SYMBOL_MAP: Record<string, string> = {
  '0': '௦',
  '1': '௧',
  '2': '௨',
  '3': '௩',
  '4': '௪',
  '5': '௫',
  '6': '௬',
  '7': '௭',
  '8': '௮',
  '9': '௯'
}

const NUMBER_MAP: Record<string, string> = {
  '௦': '0',
  '௧': '1',
  '௨': '2',
  '௩': '3',
  '௪': '4',
  '௫': '5',
  '௬': '6',
  '௭': '7',
  '௮': '8',
  '௯': '9'
}

function meridiemHour(hour: number, meridiem: string): number {
  if (hour === 12) hour = 0
  if (meridiem === 'யாமம்') return hour < 2 ? hour : hour + 12
  if (meridiem === 'வைகறை' || meridiem === 'காலை') return hour
  if (meridiem === 'நண்பகல்') return hour >= 10 ? hour : hour + 12
  return hour + 12
}

function meridiem(hour: number): string {
  if (hour < 2) return 'யாமம்'
  if (hour < 6) return 'வைகறை'
  if (hour < 10) return 'காலை'
  if (hour < 14) return 'நண்பகல்'
  if (hour < 18) return 'எற்பாடு'
  if (hour < 22) return 'மாலை'
  return 'யாமம்'
}

export const taLocale = {
  abbr: 'ta',
  months: 'ஜனவரி_பிப்ரவரி_மார்ச்_ஏப்ரல்_மே_ஜூன்_ஜூலை_ஆகஸ்ட்_செப்டெம்பர்_அக்டோபர்_நவம்பர்_டிசம்பர்'.split('_'),
  monthsShort: 'ஜனவரி_பிப்ரவரி_மார்ச்_ஏப்ரல்_மே_ஜூன்_ஜூலை_ஆகஸ்ட்_செப்டெம்பர்_அக்டோபர்_நவம்பர்_டிசம்பர்'.split('_'),
  weekdays: 'ஞாயிற்றுக்கிழமை_திங்கட்கிழமை_செவ்வாய்கிழமை_புதன்கிழமை_வியாழக்கிழமை_வெள்ளிக்கிழமை_சனிக்கிழமை'.split('_'),
  weekdaysShort: 'ஞாயிறு_திங்கள்_செவ்வாய்_புதன்_வியாழன்_வெள்ளி_சனி'.split('_'),
  weekdaysMin: 'ஞா_தி_செ_பு_வி_வெ_ச'.split('_'),
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'DD/MM/YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY, HH:mm',
    LLLL: 'dddd, D MMMM YYYY, HH:mm'
  },
  calendar: {
    sameDay: '[இன்று] LT',
    nextDay: '[நாளை] LT',
    nextWeek: 'dddd, LT',
    lastDay: '[நேற்று] LT',
    lastWeek: '[கடந்த வாரம்] dddd, LT',
    sameElse: 'L'
  },
  invalidDate: 'தவறான தேதி',
  dayOfMonthOrdinalParse: /\d{1,2}வது/,
  ordinal(number: number): string {
    return `${number}வது`
  },
  preparse(value: string): string {
    return value.replace(/[௦-௯]/g, (match) => NUMBER_MAP[match])
  },
  postformat(value: string | number): string {
    return value.toString().replace(/\d/g, (match) => SYMBOL_MAP[match])
  },
  meridiemParse: /யாமம்|வைகறை|காலை|நண்பகல்|எற்பாடு|மாலை/,
  meridiemHour,
  meridiem,
  week: {
    dow: 0,
    doy: 6
  }
} satisfies LocaleData
