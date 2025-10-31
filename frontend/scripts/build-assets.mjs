/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { checkPdfjs } from './pdfjs.mjs'

if (process.env.NODE_ENV !== 'development') {
  console.log('build assets ...')
  checkPdfjs().catch(console.error)
}
