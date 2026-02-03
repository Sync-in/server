import { Global, Module } from '@nestjs/common'
import { Mailer } from './mailer.service'

@Global()
@Module({
  providers: [Mailer],
  exports: [Mailer]
})
export class MailerModule {}
