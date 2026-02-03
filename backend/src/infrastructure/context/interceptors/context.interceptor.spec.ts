import { CallHandler, ExecutionContext } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { of } from 'rxjs'
import { ContextManager } from '../services/context-manager.service'
import { ContextInterceptor } from './context.interceptor'

// Helper to create a minimal ExecutionContext with Fastify-like request
function createHttpExecutionContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}) as any,
      getNext: () => ({}) as any
    }),
    getType: () => 'http' as any,
    getClass: () => ({}) as any,
    getHandler: () => ({}) as any,
    switchToRpc: () => ({}) as any,
    switchToWs: () => ({}) as any,
    getArgByIndex: () => ({}) as any,
    getArgs: () => [] as any
  } as ExecutionContext
}

describe('ContextInterceptor', () => {
  let interceptor: ContextInterceptor
  let contextManager: { run: jest.Mock }

  beforeEach(async () => {
    contextManager = {
      // By default, run will execute the provided callback and return its result
      run: jest.fn((_ctx: any, cb: () => any) => cb())
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextInterceptor,
        {
          provide: ContextManager,
          useValue: contextManager
        }
      ]
    }).compile()

    interceptor = module.get(ContextInterceptor)
  })

  it('should pass headerOriginUrl from Origin header to ContextManager.run and forward next.handle()', (done) => {
    const origin = 'https://example.com'
    const request = {
      headers: { origin, host: 'ignored-host' },
      protocol: 'http'
    }

    const context = createHttpExecutionContext(request)
    const next: CallHandler = { handle: jest.fn(() => of('ok')) }

    const result$ = interceptor.intercept(context, next)

    expect(contextManager.run).toHaveBeenCalledTimes(1)
    const [ctxArg, cbArg] = contextManager.run.mock.calls[0]
    expect(ctxArg).toEqual({ headerOriginUrl: origin })
    expect(typeof cbArg).toBe('function')
    // next.handle is invoked synchronously by ContextManager.run; assert in subscription to keep flow consistent
    result$.subscribe({
      next: (val) => {
        expect(next.handle).toHaveBeenCalledTimes(1)
        expect(val).toBe('ok')
        done()
      },
      error: done
    })
  })

  it('should build headerOriginUrl from protocol and host when Origin header is missing', (done) => {
    const request = {
      headers: { host: 'my-host.local:3000' },
      protocol: 'http'
    }

    const context = createHttpExecutionContext(request)
    const next: CallHandler = { handle: jest.fn(() => of({ status: 'passed' })) }

    const result$ = interceptor.intercept(context, next)

    expect(contextManager.run).toHaveBeenCalledTimes(1)
    const [ctxArg, cbArg] = contextManager.run.mock.calls[0]
    expect(ctxArg).toEqual({ headerOriginUrl: 'http://my-host.local:3000' })
    expect(typeof cbArg).toBe('function')

    result$.subscribe({
      next: (val) => {
        expect(next.handle).toHaveBeenCalledTimes(1)
        expect(val).toEqual({ status: 'passed' })
        done()
      },
      error: done
    })
  })

  it('should return the observable produced by next.handle() within ContextManager.run callback', (done) => {
    // Ensure run executes the callback and returns its result
    contextManager.run.mockImplementation((_ctx: any, cb: () => any) => cb())

    const request = {
      headers: { origin: 'https://origin.test' },
      protocol: 'https'
    }

    const context = createHttpExecutionContext(request)
    const next: CallHandler = { handle: jest.fn(() => of(123)) }

    const result$ = interceptor.intercept(context, next)

    result$.subscribe({
      next: (val) => {
        expect(val).toBe(123)
        expect(next.handle).toHaveBeenCalledTimes(1)
        done()
      },
      error: done
    })
  })
})
