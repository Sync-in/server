import { describe, expect, it } from 'vitest'
import { redactRedisUrl } from './utils'

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
