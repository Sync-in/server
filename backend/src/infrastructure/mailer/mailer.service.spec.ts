import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import nodemailer from 'nodemailer'
import { MailerConfig } from './mailer.config'
import { Mailer } from './mailer.service'

// Mocks
jest.mock('nodemailer')
const createTransportMock = {
  verify: jest.fn().mockResolvedValue(true),
  sendMail: jest.fn().mockResolvedValue(true)
}
;(nodemailer.createTransport as jest.Mock).mockReturnValue(createTransportMock)

describe(Mailer.name, () => {
  let module: TestingModule
  let mailer: Mailer
  let configService: ConfigService
  let logger: PinoLogger

  const mailerConfig: MailerConfig = {
    host: 'smtp.example.com',
    port: 587,
    auth: { user: 'user', pass: 'pass' },
    secure: false,
    sender: 'noreply@example.com',
    debug: false,
    logger: false
  }

  const initModule = async (config: MailerConfig | undefined) => {
    module = await Test.createTestingModule({
      providers: [
        Mailer,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(config) } },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            assign: jest.fn(),
            logger: { level: 'info' }
          }
        }
      ]
    }).compile()

    mailer = module.get<Mailer>(Mailer)
    configService = module.get<ConfigService>(ConfigService)
    logger = module.get<PinoLogger>(PinoLogger)
  }

  beforeAll(async () => {
    await initModule(undefined)
  })

  it('should be defined', () => {
    expect(module).toBeDefined()
    expect(mailer).toBeDefined()
    expect(configService).toBeDefined()
    expect(logger).toBeDefined()
  })

  it('should not initialize transporter if config is absent', () => {
    expect(mailer['transport']).toBeUndefined()
    expect(nodemailer.createTransport).not.toHaveBeenCalled()
  })

  it('should initialize secure transport with no secure port', async () => {
    await initModule({ ...mailerConfig, secure: true })
    expect(mailer['configuration'].secure).toBe(false)
    await initModule({ ...mailerConfig, port: 25, secure: true, logger: true, debug: true })
    expect(mailer['configuration'].secure).toBe(false)
    const loggerWarnSpy = jest.spyOn(logger, 'warn')
    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringMatching(/has been disabled/i))
    loggerWarnSpy.mockClear()
  })

  it('should set mailer availability to false if transport failed', async () => {
    createTransportMock.verify.mockRejectedValueOnce(new Error('Mail Server down'))
    await initModule(mailerConfig)
    expect(mailer.available).toBe(false)
    const loggerErrorSpy = jest.spyOn(logger, 'error')
    expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/mail server down/i))
    loggerErrorSpy.mockClear()
  })

  it('should initialize transporter if config exists', async () => {
    // Reinstantiate the module and the services
    await initModule(mailerConfig)
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: mailerConfig.host,
        port: mailerConfig.port,
        auth: mailerConfig.auth,
        secure: mailerConfig.secure
      }),
      expect.objectContaining({
        from: mailerConfig.sender
      })
    )
  })

  it('should send mails when available', async () => {
    mailer.available = true
    await mailer.sendMails([{ to: 'test@example.com', subject: 'Hello', html: 'world' }])
    expect(createTransportMock.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'test@example.com' }))
    createTransportMock.sendMail.mockClear()
  })

  it('should not send mails when not available', async () => {
    mailer.available = false
    await mailer.sendMails([{ to: 'test@example.com', subject: 'Hello', html: 'world' }])
    expect(createTransportMock.sendMail).not.toHaveBeenCalled()
    createTransportMock.sendMail.mockClear()
  })

  it('should continue sending remaining mails if one send fails and log error', async () => {
    mailer.available = true
    // first call rejects, second resolves
    createTransportMock.sendMail.mockRejectedValueOnce(new Error('SMTP down')).mockResolvedValueOnce(true)
    await mailer.sendMails([
      { to: 'fail@example.com', subject: 'One', html: '1' },
      { to: 'ok@example.com', subject: 'Two', html: '2' }
    ])

    expect(createTransportMock.sendMail).toHaveBeenCalledTimes(2)
    expect(createTransportMock.sendMail).toHaveBeenNthCalledWith(1, expect.objectContaining({ to: 'fail@example.com' }))
    expect(createTransportMock.sendMail).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: 'ok@example.com' }))
    createTransportMock.sendMail.mockClear()
  })
})
