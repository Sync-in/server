import { INFRASTRUCTURE_DEPENDENCY } from './availability.constants'
import { Availability } from './availability.service'

describe(Availability.name, () => {
  it('notifies listeners only when a dependency state changes', () => {
    const availability = new Availability()
    const listener = vi.fn()
    const unsubscribe = availability.onChange(listener)

    availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE)
    availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, false)
    availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, true)
    unsubscribe()
    availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, false)

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, INFRASTRUCTURE_DEPENDENCY.DATABASE, false)
    expect(listener).toHaveBeenNthCalledWith(2, INFRASTRUCTURE_DEPENDENCY.DATABASE, true)
  })
})
