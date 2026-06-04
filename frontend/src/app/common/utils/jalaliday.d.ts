import 'dayjs/esm'

declare module 'dayjs/esm' {
  interface Dayjs {
    calendar: (type: 'jalali' | 'gregory') => Dayjs & {
      calendar: (type: 'jalali' | 'gregory') => Dayjs
    }
  }
}
