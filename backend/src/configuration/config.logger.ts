import type { Options } from 'pino-http'
import { join } from 'node:path'
import { AVAILABILITY_ROUTE } from '../infrastructure/availability/availability.constants'
import type { LoggerConfig } from './config.validation'
import type { FastifyLoggerRequest, LoggerErrorObject, LoggerSerializedResponse } from './interfaces/logger.interface'

const AVAILABILITY_ROUTE_PREFIX = `${AVAILABILITY_ROUTE.BASE}/`
const PINO_WARN_LEVEL = 40
const NEST_APPLICATION_CONTEXT = 'NestApplication'
const MUTED_NEST_STARTUP_CONTEXTS = new Set(['NestFactory', 'InstanceLoader', 'RoutesResolver', 'RouterExplorer', NEST_APPLICATION_CONTEXT])
const MESSAGE_COLOR_MARKER = '\uE000SYNC_IN_WHITE\uE001'
const MESSAGE_FORMAT =
  '[{context}]{if tag} [{tag}] {end}{if user} <{user}> {end} {msg}{if res} ({res.contentLength} bytes in {responseTime}ms) {userAgent}{end}{if reqId} | {reqId}{end}'
const COLORIZED_MESSAGE_FORMAT = MESSAGE_FORMAT.replace('{msg}', `${MESSAGE_COLOR_MARKER}{msg}`)

const createPrettyTransport = (loggerConfig: LoggerConfig) => {
  const prettyOptions = {
    ignore: 'hostname,context,reqId,req,res,user,userAgent,responseTime,tag',
    hideObject: false,
    singleLine: false,
    colorize: loggerConfig.colorize,
    colorizeObjects: false,
    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
    messageFormat: loggerConfig.colorize ? COLORIZED_MESSAGE_FORMAT : MESSAGE_FORMAT
  }
  const destinationOptions = {
    destination: loggerConfig.stdout ? 1 : loggerConfig.filePath,
    mkdir: true,
    sync: false
  }

  if (!loggerConfig.colorize) {
    return {
      target: 'pino-pretty',
      options: {
        ...prettyOptions,
        ...destinationOptions
      }
    }
  }

  return {
    pipeline: [
      {
        target: join(__dirname, 'config.logger.transport.cjs'),
        options: {
          messageColorMarker: MESSAGE_COLOR_MARKER,
          ...prettyOptions
        }
      },
      {
        target: 'pino/file',
        options: destinationOptions
      }
    ]
  }
}

export const configLogger = (loggerConfig: LoggerConfig) => {
  let isNestBootstrapping = true

  return {
    level: loggerConfig.level,
    autoLogging: true,
    quietReqLogger: true,
    hooks: {
      logMethod(args, method, level) {
        if (isNestBootstrapping && level < PINO_WARN_LEVEL) {
          const logObject = args[0]
          const context = typeof logObject === 'object' && logObject !== null && 'context' in logObject ? logObject.context : undefined

          // Hide routine NestJS startup logs while preserving warnings and errors.
          if (typeof context === 'string' && MUTED_NEST_STARTUP_CONTEXTS.has(context)) {
            // NestApplication emits the final NestJS startup message once app.init() completes.
            if (context === NEST_APPLICATION_CONTEXT) {
              isNestBootstrapping = false
            }
            return
          }
        }

        method.apply(this, args)
      }
    },
    customProps: (req) => ({
      context: 'HTTP',
      user: req.user,
      userAgent: req.headers['user-agent']
    }),
    customSuccessMessage: (req, res) => {
      return `${req.method} ${req.url} (${req.protocol.toUpperCase()}/${req.httpVersion} ${res.statusCode}) ${req.ip}`
    },
    customErrorMessage: (req, res) => {
      return `${req.method} ${req.url} (${req.protocol.toUpperCase()}/${req.httpVersion} ${res.statusCode}) ${req.ip}`
    },
    customLogLevel: (req, res, err) => {
      // Successful health checks are frequent and provide little value in logs.
      // Keep failed checks visible so readiness issues remain diagnosable.
      if (res.statusCode === 200 && req.url?.startsWith(AVAILABILITY_ROUTE_PREFIX)) {
        return 'silent'
      }
      if (res.statusCode >= 400 && res.statusCode < 500) {
        return 'warn'
      } else if (res.statusCode >= 500 || err) {
        return 'error'
      }
      return 'info'
    },
    customErrorObject: (_req, _res, _error, val: LoggerErrorObject) => {
      // Keep response metadata for 404s without logging the associated error object.
      if (val.res.statusCode === 404) {
        return {
          res: val.res,
          responseTime: val.responseTime
        }
      }

      return val
    },
    serializers: {
      res(response: LoggerSerializedResponse) {
        return {
          contentLength: response.headers['content-length'] || '0'
        }
      },
      req() {
        return undefined
      }
    },
    transport: loggerConfig.jsonOutput ? null : createPrettyTransport(loggerConfig)
  } satisfies Options<FastifyLoggerRequest>
}
