import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AvailabilityGuard } from './availability.guard'
import { Availability } from './availability.service'

@Global()
@Module({
  providers: [
    Availability,
    {
      provide: APP_GUARD,
      useClass: AvailabilityGuard
    }
  ],
  exports: [Availability]
})
export class AvailabilityModule {}
