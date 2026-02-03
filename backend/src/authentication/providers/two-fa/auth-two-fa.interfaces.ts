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
