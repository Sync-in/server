import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AVAILABILITY_SKIP } from './availability.decorator'
import { Availability } from './availability.service'

@Injectable()
export class AvailabilityGuard implements CanActivate {
  constructor(
    private readonly availability: Availability,
    private readonly reflector: Reflector
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const availabilitySkip = this.reflector.getAllAndOverride<boolean>(AVAILABILITY_SKIP, [context.getHandler(), context.getClass()])
    if (availabilitySkip) return true

    if (!this.availability.allAvailable()) {
      throw new ServiceUnavailableException('Service unavailable')
    }
    return true
  }
}
