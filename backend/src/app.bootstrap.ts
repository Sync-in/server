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
import { FastifyInstance, FastifyRequest } from 'fastify'
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino'
import { CONTENT_SECURITY_POLICY } from './app.constants'
import { AppModule } from './app.module'
import { bootstrapWebDAV } from './applications/webdav/utils/bootstrap'
import { IS_TEST_ENV, STATIC_PATH } from './configuration/config.constants'
import { configuration } from './configuration/config.environment'
import { WebSocketAdapter } from './infrastructure/websocket/adapters/web-socket.adapter'

export async function appBootstrap(): Promise<NestFastifyApplication> {
  /* APP */
  const fastifyAdapter = new FastifyAdapter({
    logger: false,
    trustProxy: configuration.server.trustProxy,
    routerOptions: {
      ignoreTrailingSlash: true,
      maxParamLength: 256
    },
    bodyLimit: 26214400 /* 25 MB */
  })
  const app: NestFastifyApplication = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    bufferLogs: true
  })

  /* NestJS starts listening for shutdown hooks */
  app.enableShutdownHooks()

  /* Fastify instance */
  const fastifyInstance: FastifyInstance = fastifyAdapter.getInstance()

  /* LOGGER */
  app.useLogger(IS_TEST_ENV ? ['fatal'] : app.get(Logger))

  /* WEBDAV BOOTSTRAP RULES */
  bootstrapWebDAV(app, fastifyInstance)

  /* PARSER */
  // '*' body parser allow binary data as a stream (unlimited body size)
  fastifyInstance.addContentTypeParser('*', { bodyLimit: 0 }, (_req: FastifyRequest, _payload: FastifyRequest['raw'], done) => done(null))

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
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: CONTENT_SECURITY_POLICY(
      configuration.applications.files.onlyoffice.externalServer,
      configuration.applications.files.collabora.externalServer
    )
  })

  /* COOKIES */
  // we use csrf secret to unsign csrf cookie
  await app.register(fastifyCookie, {
    secret: configuration.auth.token.csrf.secret,
    parseOptions: {
      secure: 'auto',
      sameSite: configuration.auth.cookieSameSite,
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
