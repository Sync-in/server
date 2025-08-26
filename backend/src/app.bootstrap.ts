/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import fastifyCookie from '@fastify/cookie'
import fastifyHelmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { FastifyRequest } from 'fastify'
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino'
import { CONTENT_SECURITY_POLICY } from './app.constants'
import { AppModule } from './app.module'
import { HTTP_WEBDAV_METHOD } from './applications/applications.constants'
import { WEBDAV_NS, WEBDAV_SPACES } from './applications/webdav/constants/routes'
import { IS_TEST_ENV, STATIC_PATH } from './configuration/config.constants'
import { configuration } from './configuration/config.environment'
import { WebSocketAdapter } from './infrastructure/websocket/adapters/web-socket.adapter'

export async function appBootstrap(): Promise<NestFastifyApplication> {
  /* APP */
  const fastifyAdapter = new FastifyAdapter({
    logger: false,
    trustProxy: configuration.server.trustProxy,
    ignoreTrailingSlash: true,
    maxParamLength: 256,
    bodyLimit: 26214400 /* 25 MB */
  })
  const app: NestFastifyApplication = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    bufferLogs: true
  })

  /* Fastify instance */
  const fastifyInstance = fastifyAdapter.getInstance()

  /* LOGGER */
  app.useLogger(IS_TEST_ENV ? ['fatal'] : app.get(Logger))

  /* PARSER */
  // xml body parser is used for webdav methods
  app.useBodyParser(['application/xml', 'text/xml'])
  // add webdav methods
  for (const method of Object.values(HTTP_WEBDAV_METHOD)) {
    fastifyInstance.addHttpMethod(method, { hasBody: true })
  }
  // '*' body parser allow binary data as stream (unlimited body size)
  fastifyInstance.addContentTypeParser('*', { bodyLimit: 0 }, (_req: FastifyRequest, _payload: FastifyRequest['raw'], done) => done(null))

  // Joplin clients send incorrect `Content-Type` headers when syncing over WebDAV (issue: https://github.com/laurent22/joplin/issues/122499)
  // This hook intercepts matching requests and sets `application/octet-stream` to ensure compatibility and successful sync.
  // todo: remove it when fixed on Joplin side
  fastifyInstance.addHook('onRequest', async (req, _reply) => {
    if ((req.headers['user-agent'] || '').indexOf('Joplin') !== -1 && req.originalUrl.startsWith(WEBDAV_SPACES[WEBDAV_NS.WEBDAV].route)) {
      req.headers['content-type'] = 'application/octet-stream'
    }
  })

  /* INTERCEPTORS */
  app.useGlobalInterceptors(
    new LoggerErrorInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludePrefixes: ['_']
    })
  )
  /* VALIDATION */
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

  /* STATIC */
  app.useStaticAssets({ root: STATIC_PATH, prefixAvoidTrailingSlash: true })

  /* SECURITY */
  await app.register(fastifyHelmet, { contentSecurityPolicy: CONTENT_SECURITY_POLICY(configuration.applications.files.onlyoffice.externalServer) })

  /* COOKIES */
  // we use csrf secret to unsign csrf cookie
  await app.register(fastifyCookie, {
    secret: configuration.auth.token.csrf.secret,
    parseOptions: {
      secure: 'auto',
      sameSite: configuration.auth.sameSite,
      httpOnly: true
    }
  })

  /* UPLOAD */
  await app.register(multipart, {
    preservePath: true,
    limits: { parts: Infinity, fileSize: configuration.applications.files.maxUploadSize }
  })

  /* WEBSOCKET */
  if (!IS_TEST_ENV) {
    const webSocketAdapter = new WebSocketAdapter(app)
    await webSocketAdapter.initAdapter()
    app.useWebSocketAdapter(webSocketAdapter)
  }

  return app
}
