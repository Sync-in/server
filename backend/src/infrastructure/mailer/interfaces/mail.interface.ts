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
