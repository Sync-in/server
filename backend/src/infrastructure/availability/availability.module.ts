import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AvailabilityController } from './availability.controller'
import { AvailabilityGuard } from './availability.guard'
import { Availability } from './availability.service'

@Global()
@Module({
  controllers: [AvailabilityController],
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
