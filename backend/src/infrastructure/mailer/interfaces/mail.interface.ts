/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export interface MailTransport {
  host: string
  port: number
  secure: boolean
  ignoreTLS: boolean
  auth: {
    user: string
    pass: string
  }
  debug?: boolean
  logger?: any
}

export interface MailDefaultsTransport {
  from: string
  tls: {
    rejectUnauthorized: boolean
  }
}

export interface MailProps {
  to: string
  subject: string
  html: string
}
