/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

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
