import dayjs from 'dayjs/esm'
import duration from 'dayjs/esm/plugin/duration'
import localizedFormat from 'dayjs/esm/plugin/localizedFormat'
import relativeTime from 'dayjs/esm/plugin/relativeTime'
import utc from 'dayjs/esm/plugin/utc'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)
dayjs.extend(utc)
dayjs.extend(duration)

export { dayjs as dJs }
