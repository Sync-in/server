import { Test, TestingModule } from '@nestjs/testing'
import { configuration } from '../../../configuration/config.environment'
import type { ContextStore } from '../interfaces/context-store.interface'
import { ContextManager } from './context-manager.service'

describe(ContextManager.name, () => {
  let contextManager: ContextManager
  const initialPublicUrl = configuration.server.publicUrl

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContextManager]
    }).compile()

    contextManager = module.get<ContextManager>(ContextManager)
  })

  beforeEach(() => {
    configuration.server.publicUrl = undefined
  })

  afterAll(() => {
    configuration.server.publicUrl = initialPublicUrl
  })

  it('should be defined', () => {
    expect(contextManager).toBeDefined()
  })

  const runWithContext = <T>(ctx: ContextStore, fn: () => T): T => contextManager.run(ctx, fn) as unknown as T

  describe('Context access', () => {
    it('publicOriginUrl() should return undefined when no URL is configured and no context is active', () => {
      expect(contextManager.publicOriginUrl()).toBeUndefined()
    })

    it('publicOriginUrl() should prefer the configured public URL and preserve its port', () => {
      configuration.server.publicUrl = 'http://192.168.62.131:8060'

      runWithContext({ headerOriginUrl: 'https://request-origin.example' }, () => {
        expect(contextManager.publicOriginUrl()).toBe('http://192.168.62.131:8060')
      })
    })

    it('run() should expose context within the callback and surface return value', () => {
      const ctx = { headerOriginUrl: 'https://sync-in.example' }

      const value = runWithContext<number>(ctx, () => {
        expect(contextManager.publicOriginUrl()).toBe(ctx.headerOriginUrl)
        return 123
      })

      expect(value).toBe(123)
    })
  })

  describe('Context lifecycle', () => {
    it('should restore to no context after run() completes', () => {
      const ctx = { headerOriginUrl: 'https://sync-in.example' }

      runWithContext<void>(ctx, () => {
        expect(contextManager.publicOriginUrl()).toBe(ctx.headerOriginUrl)
      })

      expect(contextManager.publicOriginUrl()).toBeUndefined()
    })

    it('should support nested contexts and restore the previous one after inner run()', () => {
      const outer = { headerOriginUrl: 'https://outer.example' }
      const inner = { headerOriginUrl: 'https://inner.example' }

      runWithContext<void>(outer, () => {
        expect(contextManager.publicOriginUrl()).toBe(outer.headerOriginUrl)

        runWithContext<void>(inner, () => {
          expect(contextManager.publicOriginUrl()).toBe(inner.headerOriginUrl)
        })

        expect(contextManager.publicOriginUrl()).toBe(outer.headerOriginUrl)
      })

      expect(contextManager.publicOriginUrl()).toBeUndefined()
    })
  })

  describe('Async propagation', () => {
    it('should propagate context across microtasks (Promise)', async () => {
      const ctx = { headerOriginUrl: 'https://async.example' }

      await runWithContext<Promise<void>>(ctx, async () => {
        await Promise.resolve()
        expect(contextManager.publicOriginUrl()).toBe(ctx.headerOriginUrl)
      })
    })

    it('should propagate context across timers (setTimeout)', async () => {
      const ctx = { headerOriginUrl: 'https://timer.example' }

      await runWithContext<Promise<void>>(ctx, async () => {
        await new Promise<void>((resolve) =>
          setTimeout(() => {
            expect(contextManager.publicOriginUrl()).toBe(ctx.headerOriginUrl)
            resolve()
          }, 0)
        )
      })
    })
  })
})
