import { HttpStatus, ServiceUnavailableException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AUTH_TOKEN_SKIP } from '../../authentication/decorators/auth-token-skip.decorator'
import { AVAILABILITY_ROUTE, AVAILABILITY_STATUS, INFRASTRUCTURE_DEPENDENCY } from './availability.constants'
import { AvailabilityController } from './availability.controller'
import { AVAILABILITY_SKIP } from './availability.decorator'
import { Availability } from './availability.service'

describe(AvailabilityController.name, () => {
  let availability: Availability
  let controller: AvailabilityController

  beforeEach(() => {
    availability = new Availability()
    controller = new AvailabilityController(availability)
  })

  it(`GET ${AVAILABILITY_ROUTE.BASE}/${AVAILABILITY_ROUTE.LIVE} reports a live process independently of dependencies`, () => {
    availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE)

    expect(controller.liveness()).toEqual({ status: AVAILABILITY_STATUS.OK })
  })

  it(`GET ${AVAILABILITY_ROUTE.BASE}/${AVAILABILITY_ROUTE.READY} reports an available service`, () => {
    availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE, true)

    expect(controller.readiness()).toEqual({ status: AVAILABILITY_STATUS.OK })
  })

  it(`GET ${AVAILABILITY_ROUTE.BASE}/${AVAILABILITY_ROUTE.READY} reports an unavailable service`, () => {
    availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE)

    let error: unknown
    try {
      controller.readiness()
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(ServiceUnavailableException)
    expect((error as ServiceUnavailableException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
    expect((error as ServiceUnavailableException).getResponse()).toEqual({ status: AVAILABILITY_STATUS.UNAVAILABLE })
  })

  it('bypasses authentication and availability guards', () => {
    const reflector = new Reflector()

    expect(reflector.get<boolean>(AUTH_TOKEN_SKIP, AvailabilityController)).toBe(true)
    expect(reflector.get<boolean>(AVAILABILITY_SKIP, AvailabilityController)).toBe(true)
  })
})
