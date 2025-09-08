/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import qrcode from 'qrcode-generator'

export function qrcodeToDataURL(text: string) {
  const qr = qrcode(0, 'M') // version auto, correction M
  qr.addData(text)
  qr.make()

  const svg = qr.createSvgTag({ margin: 2, scalable: true })

  const base64 = Buffer.from(svg).toString('base64')
  return `data:image/svg+xml;base64,${base64}`
}
