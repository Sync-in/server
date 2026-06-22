import { CallHandler, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { lastValueFrom, of } from 'rxjs'
import { Readable } from 'stream'
import zlib from 'node:zlib'
import {
  MAX_COMPRESSED_SYNC_DIFF_BODY_SIZE,
  MAX_DECOMPRESSED_SYNC_DIFF_BODY_SIZE,
  SyncDiffGzipBodyInterceptor
} from './sync-diff-gzip-body.interceptor'

const EXPECTED_MAX_COMPRESSED_SYNC_DIFF_BODY_SIZE = 25 * 1024 * 1024
const EXPECTED_MAX_DECOMPRESSED_SYNC_DIFF_BODY_SIZE = 50 * 1024 * 1024

describe('SyncDiffGzipBodyInterceptor', () => {
  let interceptor: SyncDiffGzipBodyInterceptor

  const createReadableFrom = (data: Buffer | string): Readable => {
    const stream = new Readable()
    stream.push(data)
    stream.push(null)
    return stream
  }

  const createExecutionContextWithRequest = (req: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => req
      })
    } as ExecutionContext
  }

  const createCallHandler = <T = any>(value: T = 'ok' as unknown as T): CallHandler => {
    return {
      handle: vi.fn(() => of(value))
    }
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SyncDiffGzipBodyInterceptor]
    }).compile()

    interceptor = module.get(SyncDiffGzipBodyInterceptor)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should keep sync diff gzip body limits aligned with expected sizes', () => {
    expect(MAX_COMPRESSED_SYNC_DIFF_BODY_SIZE).toBe(EXPECTED_MAX_COMPRESSED_SYNC_DIFF_BODY_SIZE)
    expect(MAX_DECOMPRESSED_SYNC_DIFF_BODY_SIZE).toBe(EXPECTED_MAX_DECOMPRESSED_SYNC_DIFF_BODY_SIZE)
  })

  it('should gunzip and parse JSON body when Content-Encoding is gzip', async () => {
    const originalBody = { a: 1, b: 'two' }
    const gzipped = zlib.gzipSync(Buffer.from(JSON.stringify(originalBody)))
    const req: any = {
      headers: { 'content-encoding': 'gzip' },
      raw: createReadableFrom(gzipped),
      body: undefined
    }
    const ctx = createExecutionContextWithRequest(req)
    const next = createCallHandler('handled')

    const result$ = await interceptor.intercept(ctx, next)
    const result = await lastValueFrom(result$)

    expect(result).toBe('handled')
    expect(next.handle).toHaveBeenCalledTimes(1)
    expect(req.body).toEqual(originalBody)
  })

  it('should pass through without modifying body when Content-Encoding is not gzip', async () => {
    const req: any = {
      headers: {},
      raw: createReadableFrom(Buffer.from('no use in this case')),
      body: 'initial'
    }
    const ctx = createExecutionContextWithRequest(req)
    const next = createCallHandler('passthrough')

    const result$ = await interceptor.intercept(ctx, next)
    const result = await lastValueFrom(result$)

    expect(result).toBe('passthrough')
    expect(next.handle).toHaveBeenCalledTimes(1)
    expect(req.body).toBe('initial')
  })

  it('should throw BadRequest when gzip body is invalid', async () => {
    const invalidGzip = Buffer.from('this-is-not-gzip')
    const req: any = {
      headers: { 'content-encoding': 'gzip' },
      raw: createReadableFrom(invalidGzip)
    }
    const ctx = createExecutionContextWithRequest(req)
    const next = createCallHandler()

    await expect(interceptor.intercept(ctx, next)).rejects.toEqual(new HttpException('Invalid gzip body', HttpStatus.BAD_REQUEST))
    expect(next.handle).not.toHaveBeenCalled()
  })

  it('should reject gzip body when compressed payload is too large', async () => {
    const req: any = {
      headers: { 'content-encoding': 'gzip' },
      raw: createReadableFrom(Buffer.alloc(EXPECTED_MAX_COMPRESSED_SYNC_DIFF_BODY_SIZE + 1))
    }
    const ctx = createExecutionContextWithRequest(req)
    const next = createCallHandler()

    let error: unknown
    try {
      await interceptor.intercept(ctx, next)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(HttpException)
    const ex = error as HttpException
    expect(ex.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE)
    expect(ex.getResponse()).toBe('Gzip body is too large')
    expect(next.handle).not.toHaveBeenCalled()
  })

  it('should pass decompressed output limit to gunzip', async () => {
    const gzipped = zlib.gzipSync(Buffer.from(JSON.stringify({ ok: true })))
    const gunzip = vi.spyOn(zlib, 'gunzip').mockImplementationOnce(((_body, options, callback) => {
      expect(options).toMatchObject({ maxOutputLength: MAX_DECOMPRESSED_SYNC_DIFF_BODY_SIZE })
      callback(null, Buffer.from(JSON.stringify({ ok: true })))
    }) as typeof zlib.gunzip)
    const req: any = {
      headers: { 'content-encoding': 'gzip' },
      raw: createReadableFrom(gzipped)
    }
    const ctx = createExecutionContextWithRequest(req)
    const next = createCallHandler()

    await interceptor.intercept(ctx, next)

    expect(gunzip).toHaveBeenCalledTimes(1)
    expect(next.handle).toHaveBeenCalledTimes(1)
  })

  it('should throw Payload Too Large when decompressed gzip body exceeds the limit', async () => {
    vi.spyOn(zlib, 'gunzip').mockImplementationOnce(((_body, _options, callback) => {
      callback(new Error('maxOutputLength exceeded'), null)
    }) as typeof zlib.gunzip)
    const req: any = {
      headers: { 'content-encoding': 'gzip' },
      raw: createReadableFrom(zlib.gzipSync(Buffer.from(JSON.stringify({ ok: true }))))
    }
    const ctx = createExecutionContextWithRequest(req)
    const next = createCallHandler()

    let error: unknown
    try {
      await interceptor.intercept(ctx, next)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(HttpException)
    const ex = error as HttpException
    expect(ex.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE)
    expect(ex.getResponse()).toBe('Invalid gzip body')
    expect(next.handle).not.toHaveBeenCalled()
  })

  it('should throw BadRequest when decoded JSON is invalid', async () => {
    // gzip-compressed invalid JSON (plain text)
    const gzippedInvalidJson = zlib.gzipSync(Buffer.from('not-json'))
    const req: any = {
      headers: { 'content-encoding': 'gzip' },
      raw: createReadableFrom(gzippedInvalidJson)
    }
    const ctx = createExecutionContextWithRequest(req)
    const next = createCallHandler()

    let error: unknown
    try {
      await interceptor.intercept(ctx, next)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(HttpException)
    const ex = error as HttpException
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST)
    expect(String(ex.getResponse())).toContain('Invalid JSON')
    expect(next.handle).not.toHaveBeenCalled()
  })
})
