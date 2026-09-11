import { INFRASTRUCTURE_DEPENDENCY } from '../availability/availability.constants'
import type { AvailabilityDependency } from '../availability/availability.interfaces'
import type { CronJob } from 'cron'
import { SchedulerManager } from './scheduler-manager.service'

describe(SchedulerManager.name, () => {
  const createCronJob = (initiallyActive: boolean) => {
    let active = initiallyActive
    return {
      get isActive() {
        return active
      },
      start: vi.fn(() => {
        active = true
      }),
      stop: vi.fn(() => {
        active = false
        return undefined
      })
    }
  }

  let availabilityListener: (dependency: AvailabilityDependency, isAvailable: boolean) => void
  let dependencies: Record<AvailabilityDependency, boolean>
  let cronJobs: Map<string, Pick<CronJob, 'isActive' | 'start' | 'stop'>>
  let timeouts: string[]
  let deleteTimeout: ReturnType<typeof vi.fn>
  let manager: SchedulerManager

  beforeEach(() => {
    dependencies = {
      [INFRASTRUCTURE_DEPENDENCY.DATABASE]: true,
      [INFRASTRUCTURE_DEPENDENCY.CACHE]: true,
      [INFRASTRUCTURE_DEPENDENCY.WEBSOCKET]: false
    }
    cronJobs = new Map()
    timeouts = []
    deleteTimeout = vi.fn((name: string) => {
      timeouts = timeouts.filter((timeout) => timeout !== name)
    })
    const schedulerRegistry = {
      getCronJobs: vi.fn(() => cronJobs),
      getCronJob: vi.fn((name: string) => cronJobs.get(name)),
      getTimeouts: vi.fn(() => timeouts),
      doesExist: vi.fn((type: string, name: string) => type === 'cron' && cronJobs.has(name)),
      deleteCronJob: vi.fn((name: string) => {
        cronJobs.get(name)?.stop()
        cronJobs.delete(name)
      }),
      deleteTimeout,
      addCronJob: vi.fn((name: string, job: CronJob) => cronJobs.set(name, job))
    }
    const availability = {
      isAvailable: vi.fn((dependency: AvailabilityDependency) => dependencies[dependency]),
      onChange: vi.fn((listener: typeof availabilityListener) => {
        availabilityListener = listener
        return vi.fn()
      })
    }
    manager = new SchedulerManager(schedulerRegistry as any, availability as any)
    Object.defineProperty(manager, 'isSchedulerProcess', { value: true })
  })

  afterEach(() => {
    manager.onModuleDestroy()
  })

  it('pauses active cron jobs until both database and cache are available again', () => {
    const activeJob = createCronJob(true)
    const inactiveJob = createCronJob(false)
    cronJobs.set('active', activeJob)
    cronJobs.set('inactive', inactiveJob)
    manager.onApplicationBootstrap()

    dependencies.database = false
    availabilityListener(INFRASTRUCTURE_DEPENDENCY.DATABASE, false)
    dependencies.cache = false
    availabilityListener(INFRASTRUCTURE_DEPENDENCY.CACHE, false)
    dependencies.database = true
    availabilityListener(INFRASTRUCTURE_DEPENDENCY.DATABASE, true)

    expect(activeJob.stop).toHaveBeenCalledOnce()
    expect(inactiveJob.stop).not.toHaveBeenCalled()
    expect(activeJob.start).not.toHaveBeenCalled()

    dependencies.cache = true
    availabilityListener(INFRASTRUCTURE_DEPENDENCY.CACHE, true)

    expect(activeJob.start).toHaveBeenCalledOnce()
    expect(inactiveJob.start).not.toHaveBeenCalled()
  })

  it('cancels pending timeouts when a dependency becomes unavailable', () => {
    timeouts = ['startup', 'after-startup']
    manager.onApplicationBootstrap()

    dependencies.database = false
    availabilityListener(INFRASTRUCTURE_DEPENDENCY.DATABASE, false)

    expect(deleteTimeout).toHaveBeenCalledTimes(2)
    expect(deleteTimeout).toHaveBeenCalledWith('startup')
    expect(deleteTimeout).toHaveBeenCalledWith('after-startup')
  })

  it('starts a dynamic cron registered before bootstrap and unregisters it', () => {
    manager.registerCron('dynamic', '0 * * * * *', vi.fn())
    const job = cronJobs.get('dynamic')

    expect(job?.isActive).toBe(false)

    manager.onApplicationBootstrap()

    expect(job?.isActive).toBe(true)

    manager.unregisterCron('dynamic')

    expect(job?.isActive).toBe(false)
    expect(cronJobs.has('dynamic')).toBe(false)
  })
})
