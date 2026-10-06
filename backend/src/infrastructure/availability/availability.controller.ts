import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common'
import { AuthTokenSkip } from '../../authentication/decorators/auth-token-skip.decorator.js'
import { AVAILABILITY_ROUTE, AVAILABILITY_STATUS } from './availability.constants.js'
import { AvailabilitySkip } from './availability.decorator.js'
import { Availability } from './availability.service.js'
import { type AvailabilityHealthResponse } from './availability.interfaces.js'

@Controller(AVAILABILITY_ROUTE.BASE)
@AuthTokenSkip()
@AvailabilitySkip()
export class AvailabilityController {
  constructor(private readonly availability: Availability) {}

  @Get(AVAILABILITY_ROUTE.LIVE)
  @Header('Cache-Control', 'no-store')
  liveness(): AvailabilityHealthResponse {
    return { status: AVAILABILITY_STATUS.OK }
  }

  @Get(AVAILABILITY_ROUTE.READY)
  @Header('Cache-Control', 'no-store')
  readiness(): AvailabilityHealthResponse {
    if (!this.availability.allAvailable()) {
      throw new ServiceUnavailableException({ status: AVAILABILITY_STATUS.UNAVAILABLE })
    }
    return { status: AVAILABILITY_STATUS.OK }
  }
}
