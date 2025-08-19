/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { checkCodeMirror } from './codemirror.mjs'
import { checkPdfjs } from './pdfjs.mjs'

console.log('build assets ...')
if (process.env.NODE_ENV !== 'development') {
  checkPdfjs().catch(console.error)
}
checkCodeMirror().catch(console.error)
