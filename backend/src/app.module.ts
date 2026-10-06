import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { USER_AGENT } from './app.constants.js'
import { AppService } from './app.service.js'
import { ApplicationsModule } from './applications/applications.module.js'
import { AuthModule } from './authentication/auth.module.js'
import { configuration } from './configuration/config.environment.js'
import { configLogger } from './configuration/config.logger.js'
import type { FastifyLoggerRequest } from './configuration/interfaces/logger.interface.js'
import { AvailabilityModule } from './infrastructure/availability/availability.module.js'
import { CacheModule } from './infrastructure/cache/cache.module.js'
import { ContextModule } from './infrastructure/context/context.module.js'
import { DatabaseModule } from './infrastructure/database/database.module.js'
import { MailerModule } from './infrastructure/mailer/mailer.module.js'
import { SchedulerModule } from './infrastructure/scheduler/scheduler.module.js'

@Module({
  imports: [
    LoggerModule.forRootAsync<FastifyLoggerRequest>({
      useFactory: async () => ({
        pinoHttp: configLogger(configuration.logger)
      })
    }),
    AvailabilityModule,
    AuthModule.register(configuration.auth.provider),
    DatabaseModule,
    CacheModule,
    MailerModule,
    ContextModule,
    SchedulerModule,
    ApplicationsModule,
    HttpModule.register({
      global: true,
      headers: {
        'User-Agent': USER_AGENT
      },
      proxy: false,
      timeout: 6000,
      maxRedirects: 0
    })
  ],
  providers: [AppService]
})
export class AppModule {}
