#!/usr/bin/env node
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'
import { appBootstrap } from './app.bootstrap'
import { AppService } from './app.service'
import { configuration } from './configuration/config.environment'

async function bootstrap() {
  const app: NestFastifyApplication = await appBootstrap()
  const logger: Logger = app.get<Logger>(Logger)
  await app.listen(
    {
      host: configuration.server.host,
      port: configuration.server.port
    },
    (error, address) => {
      if (configuration.server.host === '0.0.0.0') {
        const url = new URL(address)
        url.hostname = '0.0.0.0'
        address = url.toString()
      }
      if (error) {
        logger.error(`Server listening error at ${address} : ${error}`, 'HTTP')
        process.exit(1)
      } else {
        logger.log(`Server listening at ${address}`, 'HTTP')
      }
    }
  )
}

AppService.clusterize(bootstrap)
