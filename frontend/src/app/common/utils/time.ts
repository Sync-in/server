import dayjs from 'dayjs/esm'
import duration from 'dayjs/esm/plugin/duration'
import localizedFormat from 'dayjs/esm/plugin/localizedFormat'
import relativeTime from 'dayjs/esm/plugin/relativeTime'
import utc from 'dayjs/esm/plugin/utc'
import jalaliday from 'jalaliday/dayjs'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)
dayjs.extend(utc)
dayjs.extend(duration)
dayjs.extend(jalaliday as any)

export { dayjs as dJs }
