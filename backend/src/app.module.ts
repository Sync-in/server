import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
import { USER_AGENT } from './app.constants'
import { AppService } from './app.service'
import { ApplicationsModule } from './applications/applications.module'
import { AuthModule } from './authentication/auth.module'
import { configuration, exportConfiguration } from './configuration/config.environment'
import { configLogger } from './configuration/config.logger'
import { CacheModule } from './infrastructure/cache/cache.module'
import { ContextModule } from './infrastructure/context/context.module'
import { DatabaseModule } from './infrastructure/database/database.module'
import { MailerModule } from './infrastructure/mailer/mailer.module'
import { SchedulerModule } from './infrastructure/scheduler/scheduler.module'

@Module({
  imports: [
    ConfigModule.forRoot({ load: [exportConfiguration], validatePredefined: false, ignoreEnvFile: true, isGlobal: true }),
    LoggerModule.forRootAsync({
      useFactory: async () => ({
        pinoHttp: configLogger(configuration.logger)
      })
    }),
    AuthModule,
    DatabaseModule,
    CacheModule,
    MailerModule,
    ContextModule,
    SchedulerModule.register(),
    ApplicationsModule,
    HttpModule.register({
      global: true,
      headers: {
        'User-Agent': USER_AGENT
      },
      timeout: 5000,
      maxRedirects: 5
    })
  ],
  providers: [AppService]
})
export class AppModule {}
