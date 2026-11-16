import { describe, expect, it } from 'vitest'
import { connectionErrorMessage, isRetryableConnectionError, redactRedisUrl } from './utils.js'

describe(redactRedisUrl.name, () => {
  it.each([
    ['redis://127.0.0.1:6379', 'redis://127.0.0.1:6379'],
    ['redis://:password@127.0.0.1:6379', 'redis://:********@127.0.0.1:6379'],
    ['redis://default:password@127.0.0.1:6379', 'redis://default:********@127.0.0.1:6379'],
    ['rediss://user:p%40ssword@redis.example.com', 'rediss://user:********@redis.example.com']
  ])('redacts the password from %s', (url, expected) => {
    expect(redactRedisUrl(url)).toBe(expected)
  })
})

describe(isRetryableConnectionError.name, () => {
  it('recognizes retryable direct and aggregate connection errors', () => {
    const refused = connectionError('ECONNREFUSED')
    const timedOut = connectionError('ETIMEDOUT')

    expect(isRetryableConnectionError(refused)).toBe(true)
    expect(isRetryableConnectionError(new AggregateError([refused, timedOut]))).toBe(true)
    expect(isRetryableConnectionError('Socket closed unexpectedly')).toBe(true)
  })

  it('rejects unknown and mixed aggregate errors', () => {
    const refused = connectionError('ECONNREFUSED')
    const invalidConfiguration = connectionError('ERR_INVALID_URL')

    expect(isRetryableConnectionError(invalidConfiguration)).toBe(false)
    expect(isRetryableConnectionError(new AggregateError([refused, invalidConfiguration]))).toBe(false)
  })

  it('requires all nested aggregate errors to be retryable', () => {
    const refused = connectionError('ECONNREFUSED')
    const timedOut = connectionError('ETIMEDOUT')
    const invalidConfiguration = connectionError('ERR_INVALID_URL')

    expect(isRetryableConnectionError(new Error('query failed', { cause: new AggregateError([refused, timedOut]) }))).toBe(true)
    expect(isRetryableConnectionError(new Error('query failed', { cause: new AggregateError([refused, invalidConfiguration]) }))).toBe(false)
  })

  it('stops safely on circular cause chains', () => {
    const error: Error & { cause?: unknown; code: string } = Object.assign(new Error('failure'), { code: 'ERR_QUERY' })
    error.cause = error

    expect(isRetryableConnectionError(error)).toBe(false)
  })

  it('formats aggregate connection errors for logs', () => {
    const error = new AggregateError([new Error('first'), new Error('second')])

    expect(connectionErrorMessage(error)).toBe('Error: first, Error: second')
  })
})

function connectionError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code })
}
