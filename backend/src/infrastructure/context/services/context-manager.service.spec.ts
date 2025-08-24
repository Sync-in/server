/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { ContextManager } from './context-manager.service'
import type { ContextStore } from '../interfaces/context-store.interface'

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

  // Test helpers to reduce repetition and keep strong typing in one place
  const getKey = <K extends keyof ContextStore>(key: K): ContextStore[K] => contextManager.get(key) as ContextStore[K]

  const runWithContext = <T>(ctx: Partial<ContextStore>, fn: () => T): T => contextManager.run(ctx as ContextStore, fn) as unknown as T

  describe('Context access', () => {
    it('get() should return undefined when no context is active', () => {
      // Using a fake key ensures we don’t rely on a specific ContextStore shape
      expect(getKey('' as keyof ContextStore)).toBeUndefined()
    })

    it('run() should expose context within the callback and surface return value', () => {
      const ctx = { userId: 'u1', requestId: 'r1' } as Partial<ContextStore>

      const value = runWithContext<number>(ctx, () => {
        expect(getKey('userId' as keyof ContextStore)).toBe('u1')
        expect(getKey('requestId' as keyof ContextStore)).toBe('r1')
        return 123
      })

      expect(value).toBe(123)
    })
  })

  describe('Context lifecycle', () => {
    it('should restore to no context after run() completes', () => {
      const ctx = { userId: 'u2' } as Partial<ContextStore>

      runWithContext<void>(ctx, () => {
        expect(getKey('userId' as keyof ContextStore)).toBe('u2')
      })

      expect(getKey('userId' as keyof ContextStore)).toBeUndefined()
    })

    it('should support nested contexts and restore the previous one after inner run()', () => {
      const outer = { userId: 'outer' } as Partial<ContextStore>
      const inner = { userId: 'inner' } as Partial<ContextStore>

      runWithContext<void>(outer, () => {
        expect(getKey('userId' as keyof ContextStore)).toBe('outer')

        runWithContext<void>(inner, () => {
          expect(getKey('userId' as keyof ContextStore)).toBe('inner')
        })

        // After inner completes, outer should be visible again
        expect(getKey('userId' as keyof ContextStore)).toBe('outer')
      })

      // After outer completing, no context should be active
      expect(getKey('userId' as keyof ContextStore)).toBeUndefined()
    })
  })

  describe('Async propagation', () => {
    it('should propagate context across microtasks (Promise)', async () => {
      const ctx = { userId: 'async-user' } as Partial<ContextStore>

      await runWithContext<Promise<void>>(ctx, async () => {
        await Promise.resolve()
        expect(getKey('userId' as keyof ContextStore)).toBe('async-user')
      })
    })

    it('should propagate context across timers (setTimeout)', async () => {
      const ctx = { requestId: 'req-timer' } as Partial<ContextStore>

      await runWithContext<Promise<void>>(ctx, async () => {
        await new Promise<void>((resolve) =>
          setTimeout(() => {
            expect(getKey('requestId' as keyof ContextStore)).toBe('req-timer')
            resolve()
          }, 0)
        )
      })
    })
  })
})
