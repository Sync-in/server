import { Injectable, Logger } from '@nestjs/common'
import type { AvailabilityDependency, AvailabilityListener } from './availability.interfaces'

@Injectable()
export class Availability {
  private readonly logger = new Logger(Availability.name)
  private readonly dependencies = new Map<AvailabilityDependency, boolean>()
  private readonly listeners = new Set<AvailabilityListener>()

  register(dependency: AvailabilityDependency, isAvailable = false): void {
    if (!this.dependencies.has(dependency)) {
      this.dependencies.set(dependency, isAvailable)
      this.notifyListeners(dependency, isAvailable)
    }
  }

  setAvailable(dependency: AvailabilityDependency, isAvailable: boolean): void {
    if (this.dependencies.get(dependency) === isAvailable) return
    this.dependencies.set(dependency, isAvailable)
    this.notifyListeners(dependency, isAvailable)
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

  onChange(listener: AvailabilityListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(dependency: AvailabilityDependency, isAvailable: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(dependency, isAvailable)
      } catch (e) {
        this.logger.error({ tag: this.notifyListeners.name, msg: `${e}` })
      }
    }
  }
}
