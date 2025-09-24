/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export interface TwoFaSetup {
  secret: string
  qrDataUrl: string
}

export interface TwoFaVerifyResult {
  success: boolean
  message: string
}

export interface TwoFaEnableResult extends TwoFaVerifyResult {
  recoveryCodes: string[]
}
