import type { LocaleData } from 'ngx-bootstrap/chronos'

function isPM(input: string): boolean {
  return input === 'ຕອນແລງ'
}

function meridiem(hour: number): string {
  return hour < 12 ? 'ຕອນເຊົ້າ' : 'ຕອນແລງ'
}

export const loLocale = {
  abbr: 'lo',
  months: 'ມັງກອນ_ກຸມພາ_ມີນາ_ເມສາ_ພຶດສະພາ_ມິຖຸນາ_ກໍລະກົດ_ສິງຫາ_ກັນຍາ_ຕຸລາ_ພະຈິກ_ທັນວາ'.split('_'),
  monthsShort: 'ມັງກອນ_ກຸມພາ_ມີນາ_ເມສາ_ພຶດສະພາ_ມິຖຸນາ_ກໍລະກົດ_ສິງຫາ_ກັນຍາ_ຕຸລາ_ພະຈິກ_ທັນວາ'.split('_'),
  weekdays: 'ອາທິດ_ຈັນ_ອັງຄານ_ພຸດ_ພະຫັດ_ສຸກ_ເສົາ'.split('_'),
  weekdaysShort: 'ທິດ_ຈັນ_ອັງຄານ_ພຸດ_ພະຫັດ_ສຸກ_ເສົາ'.split('_'),
  weekdaysMin: 'ທ_ຈ_ອຄ_ພ_ພຫ_ສກ_ສ'.split('_'),
  weekdaysParseExact: true,
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'DD/MM/YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY HH:mm',
    LLLL: 'ວັນdddd D MMMM YYYY HH:mm'
  },
  meridiemParse: /ຕອນເຊົ້າ|ຕອນແລງ/,
  isPM,
  meridiem,
  calendar: {
    sameDay: '[ມື້ນີ້ເວລາ] LT',
    nextDay: '[ມື້ອື່ນເວລາ] LT',
    nextWeek: '[ວັນ]dddd[ໜ້າເວລາ] LT',
    lastDay: '[ມື້ວານນີ້ເວລາ] LT',
    lastWeek: '[ວັນ]dddd[ແລ້ວນີ້ເວລາ] LT',
    sameElse: 'L'
  },
  invalidDate: 'ວັນທີບໍ່ຖືກຕ້ອງ',
  dayOfMonthOrdinalParse: /(ທີ່)\d{1,2}/,
  ordinal(number: number): string {
    return `ທີ່${number}`
  }
} satisfies LocaleData
