import { Injectable } from '@nestjs/common'
import type { AvailabilityDependency } from './availability.interfaces'

@Injectable()
export class Availability {
  private readonly dependencies = new Map<AvailabilityDependency, boolean>()

  register(dependency: AvailabilityDependency, isAvailable = false): void {
    if (!this.dependencies.has(dependency)) {
      this.dependencies.set(dependency, isAvailable)
    }
  }

  setAvailable(dependency: AvailabilityDependency, isAvailable: boolean): void {
    this.dependencies.set(dependency, isAvailable)
  }

  isAvailable(dependency: AvailabilityDependency): boolean {
    return this.dependencies.get(dependency) === true
  }

  allAvailable(): boolean {
    for (const isAvailable of this.dependencies.values()) {
      if (!isAvailable) return false
    }
    return true
  }
}
