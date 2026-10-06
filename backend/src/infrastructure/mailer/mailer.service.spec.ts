import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import nodemailer, { type Transporter } from 'nodemailer'
import { MailerConfig } from './mailer.config.js'
import { Mailer } from './mailer.service.js'

// Mocks
vi.mock('nodemailer')
const createTransportMock = {
  verify: vi.fn().mockResolvedValue(true),
  sendMail: vi.fn().mockResolvedValue(true)
}
vi.mocked(nodemailer.createTransport).mockReturnValue(createTransportMock as unknown as Transporter)

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
    ignoreTLS: false,
    rejectUnauthorized: true,
    sender: 'noreply@example.com',
    logger: false
  }

  const initModule = async (config: MailerConfig | undefined, loggerLevel: string = 'info') => {
    module = await Test.createTestingModule({
      providers: [
        Mailer,
        { provide: ConfigService, useValue: { get: vi.fn().mockReturnValue(config) } },
        {
          provide: PinoLogger,
          useValue: {
            setContext: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            assign: vi.fn(),
            logger: {
              isLevelEnabled: vi.fn().mockImplementation((level: string) => level === 'debug' && ['trace', 'debug'].includes(loggerLevel))
            }
          }
        }
      ]
    }).compile()
    await module.init()

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
    expect(mailer['transporter']).toBeUndefined()
    expect(nodemailer.createTransport).not.toHaveBeenCalled()
  })

  it('should initialize secure transport with no secure port', async () => {
    await initModule({ ...mailerConfig, secure: true })
    expect(mailer['configuration'].secure).toBe(false)
    await initModule({ ...mailerConfig, port: 25, secure: true, logger: true })
    expect(mailer['configuration'].secure).toBe(false)
    const loggerWarnSpy = vi.spyOn(logger, 'warn')
    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringMatching(/has been disabled/i))
    loggerWarnSpy.mockClear()
  })

  it('should set mailer availability to false if transport failed', async () => {
    createTransportMock.verify.mockRejectedValueOnce(new Error('Mail Server down'))
    await initModule(mailerConfig)
    expect(mailer.available).toBe(false)
    const loggerErrorSpy = vi.spyOn(logger, 'error')
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
        secure: mailerConfig.secure,
        ignoreTLS: mailerConfig.ignoreTLS,
        tls: { rejectUnauthorized: mailerConfig.rejectUnauthorized },
        debug: false,
        logger: false
      }),
      expect.objectContaining({
        from: mailerConfig.sender
      })
    )
  })

  it.each([
    { loggerLevel: 'info', smtpDebug: false },
    { loggerLevel: 'debug', smtpDebug: true },
    { loggerLevel: 'trace', smtpDebug: true }
  ])('should set SMTP debug to $smtpDebug when the general logger level is $loggerLevel', async ({ loggerLevel, smtpDebug }) => {
    await initModule({ ...mailerConfig, logger: true }, loggerLevel)

    expect(nodemailer.createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        debug: smtpDebug,
        logger
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
