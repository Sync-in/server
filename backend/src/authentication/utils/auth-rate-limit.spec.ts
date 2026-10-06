import type { Cache } from '../../infrastructure/cache/cache.service.js'
import { AUTH_PASSWORD_WORK_RATE_LIMIT_OPTIONS, AUTH_WEBDAV_RATE_LIMIT_OPTIONS } from '../constants/auth.js'
import { consumePasswordWorkRateLimit, consumeRouteAuthRateLimit, consumeWebDAVRateLimit } from './auth-rate-limit.js'

describe('Authentication rate-limit helpers', () => {
  const rateLimitResult = { totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }

  it('keeps Nest route trackers in their own cache namespace', async () => {
    const consumeRateLimit = vi.fn().mockResolvedValue(rateLimitResult)
    const cache = { consumeRateLimit } as unknown as Cache

    await consumeRouteAuthRateLimit(cache, 'nest-tracker', 1_000, 6, 2_000)

    expect(consumeRateLimit).toHaveBeenCalledWith('auth-rate-limit-nest-tracker', 1_000, 6, 2_000)
  })

  it('hashes the WebDAV client IP and applies the WebDAV policy', async () => {
    const consumeRateLimit = vi.fn().mockResolvedValue(rateLimitResult)
    const cache = { consumeRateLimit } as unknown as Cache

    await consumeWebDAVRateLimit(cache, '192.0.2.1')

    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^auth-rate-limit-webdav-[a-f0-9]{64}$/),
      AUTH_WEBDAV_RATE_LIMIT_OPTIONS.ttl,
      AUTH_WEBDAV_RATE_LIMIT_OPTIONS.limit,
      AUTH_WEBDAV_RATE_LIMIT_OPTIONS.blockDuration
    )
  })

  it('uses one password-work key for equivalent submitted identifiers', async () => {
    const consumeRateLimit = vi.fn().mockResolvedValue(rateLimitResult)
    const cache = { consumeRateLimit } as unknown as Cache

    await consumePasswordWorkRateLimit(cache, ' Alice@Example.Org ')
    await consumePasswordWorkRateLimit(cache, 'alice@example.org')
    await consumePasswordWorkRateLimit(cache, 'cafe')
    await consumePasswordWorkRateLimit(cache, 'café')

    expect(consumeRateLimit.mock.calls[0][0]).toBe(consumeRateLimit.mock.calls[1][0])
    expect(consumeRateLimit.mock.calls[2][0]).toBe(consumeRateLimit.mock.calls[3][0])
    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^auth-rate-limit-password-[a-f0-9]{64}$/),
      AUTH_PASSWORD_WORK_RATE_LIMIT_OPTIONS.ttl,
      AUTH_PASSWORD_WORK_RATE_LIMIT_OPTIONS.limit,
      AUTH_PASSWORD_WORK_RATE_LIMIT_OPTIONS.blockDuration
    )
  })
})
