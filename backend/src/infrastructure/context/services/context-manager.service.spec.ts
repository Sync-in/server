import { Test, TestingModule } from '@nestjs/testing'
import type { ContextStore } from '../interfaces/context-store.interface'
import { ContextManager } from './context-manager.service'

describe(ContextManager.name, () => {
  let contextManager: ContextManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContextManager]
    }).compile()

    contextManager = module.get<ContextManager>(ContextManager)
  })

  it('should be defined', () => {
    expect(contextManager).toBeDefined()
  })

  const runWithContext = <T>(ctx: ContextStore, fn: () => T): T => contextManager.run(ctx, fn) as unknown as T

  describe('Context access', () => {
    it('headerOriginUrl() should return undefined when no context is active', () => {
      expect(contextManager.headerOriginUrl()).toBeUndefined()
    })

    it('run() should expose context within the callback and surface return value', () => {
      const ctx = { headerOriginUrl: 'https://sync-in.example' }

      const value = runWithContext<number>(ctx, () => {
        expect(contextManager.headerOriginUrl()).toBe(ctx.headerOriginUrl)
        return 123
      })

      expect(value).toBe(123)
    })
  })

  describe('Context lifecycle', () => {
    it('should restore to no context after run() completes', () => {
      const ctx = { headerOriginUrl: 'https://sync-in.example' }

      runWithContext<void>(ctx, () => {
        expect(contextManager.headerOriginUrl()).toBe(ctx.headerOriginUrl)
      })

      expect(contextManager.headerOriginUrl()).toBeUndefined()
    })

    it('should support nested contexts and restore the previous one after inner run()', () => {
      const outer = { headerOriginUrl: 'https://outer.example' }
      const inner = { headerOriginUrl: 'https://inner.example' }

      runWithContext<void>(outer, () => {
        expect(contextManager.headerOriginUrl()).toBe(outer.headerOriginUrl)

        runWithContext<void>(inner, () => {
          expect(contextManager.headerOriginUrl()).toBe(inner.headerOriginUrl)
        })

        expect(contextManager.headerOriginUrl()).toBe(outer.headerOriginUrl)
      })

      expect(contextManager.headerOriginUrl()).toBeUndefined()
    })
  })

  describe('Async propagation', () => {
    it('should propagate context across microtasks (Promise)', async () => {
      const ctx = { headerOriginUrl: 'https://async.example' }

      await runWithContext<Promise<void>>(ctx, async () => {
        await Promise.resolve()
        expect(contextManager.headerOriginUrl()).toBe(ctx.headerOriginUrl)
      })
    })

    it('should propagate context across timers (setTimeout)', async () => {
      const ctx = { headerOriginUrl: 'https://timer.example' }

      await runWithContext<Promise<void>>(ctx, async () => {
        await new Promise<void>((resolve) =>
          setTimeout(() => {
            expect(contextManager.headerOriginUrl()).toBe(ctx.headerOriginUrl)
            resolve()
          }, 0)
        )
      })
    })
  })
})
