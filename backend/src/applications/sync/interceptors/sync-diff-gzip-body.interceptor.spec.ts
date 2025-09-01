/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { CallHandler, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { lastValueFrom, of } from 'rxjs'
import { Readable } from 'stream'
import zlib from 'zlib'
import { SyncDiffGzipBodyInterceptor } from './sync-diff-gzip-body.interceptor'

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
      handle: jest.fn(() => of(value))
    }
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SyncDiffGzipBodyInterceptor]
    }).compile()

    interceptor = module.get(SyncDiffGzipBodyInterceptor)
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

  it('should throw BadRequest when decoded JSON is invalid', async () => {
    // gzip-compressed invalid JSON (plain text)
    const gzippedInvalidJson = zlib.gzipSync(Buffer.from('not-json'))
    const req: any = {
      headers: { 'content-encoding': 'gzip' },
      raw: createReadableFrom(gzippedInvalidJson)
    }
    const ctx = createExecutionContextWithRequest(req)
    const next = createCallHandler()

    try {
      await interceptor.intercept(ctx, next)
      fail('Expected interceptor to throw for invalid JSON')
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException)
      const ex = e as HttpException
      expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST)
      expect(String(ex.getResponse())).toContain('Invalid JSON')
      expect(next.handle).not.toHaveBeenCalled()
    }
  })
})
