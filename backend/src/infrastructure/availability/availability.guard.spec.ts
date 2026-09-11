import { createMock, type DeepMocked } from '@golevelup/ts-vitest'
import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { INFRASTRUCTURE_DEPENDENCY } from './availability.constants'
import { AvailabilitySkip } from './availability.decorator'
import { AvailabilityGuard } from './availability.guard'
import { Availability } from './availability.service'

describe(AvailabilityGuard.name, () => {
  let availability: Availability
  let context: DeepMocked<ExecutionContext>
  let guard: AvailabilityGuard

  beforeEach(() => {
    availability = new Availability()
    context = createMock<ExecutionContext>()
    guard = new AvailabilityGuard(availability, new Reflector())
  })

  it('allows requests when every registered dependency is available', () => {
    availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE, true)

    expect(guard.canActivate(context)).toBe(true)
  })

  it('returns a service unavailable error when a dependency is unavailable', () => {
    availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE)

    expect(() => guard.canActivate(context)).toThrow(new ServiceUnavailableException('Service unavailable'))
  })

  it('allows an unavailable dependency on an exempted route', () => {
    availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE)
    AvailabilitySkip()(context.getHandler())

    expect(guard.canActivate(context)).toBe(true)
  })
})
