import { HttpException, StandardSchemaValidationPipe } from '@nestjs/common'
import { z } from 'zod'
import {
  httpUrlSchema,
  integerFromStringSchema,
  integerNumberSchema,
  optionalHttpBaseUrlSchema,
  positiveIntegerFromStringSchema,
  safeIntegerFromStringSchema
} from './config.schema.js'

describe('configuration schemas', () => {
  describe('integer schemas', () => {
    it.each([2 ** 53, -(2 ** 54)])('preserves the large integer %s as a number', (value) => {
      expect(integerNumberSchema.parse(value)).toBe(value)
      expect(integerFromStringSchema.parse(String(value))).toBe(value)
    })

    it.each([1.5, NaN, Infinity, -Infinity])('rejects a non-integer or non-finite number: %s', (value) => {
      expect(integerNumberSchema.safeParse(value).success).toBe(false)
    })

    it.each(['42.0', '1e3', '0x10', '+42', ' 42 ', '42abc', ''])('keeps strict decimal parsing for %s', (value) => {
      expect(integerFromStringSchema.safeParse(value).success).toBe(false)
    })

    it('retains the safe integer limit for bounded query parameters', () => {
      expect(safeIntegerFromStringSchema.parse(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
      expect(safeIntegerFromStringSchema.safeParse(String(2 ** 53)).success).toBe(false)
      expect(positiveIntegerFromStringSchema.safeParse(String(2 ** 53)).success).toBe(false)
      expect(positiveIntegerFromStringSchema.safeParse('0').success).toBe(false)
      expect(positiveIntegerFromStringSchema.parse('42')).toBe(42)
    })
  })

  describe('httpUrlSchema', () => {
    it.each(['https://files.example.test/archive.zip', 'http://203.0.113.1/archive.zip', 'http://[2001:db8::1]/archive.zip'])(
      'accepts an HTTP(S) URL with a public domain or an IP address: %s',
      (url) => {
        expect(httpUrlSchema.parse(url)).toBe(url)
      }
    )

    it.each([
      'not-a-url',
      'https://internal',
      'https://-example.test',
      'https://example-.test',
      'https://example..test',
      'https://.example.test',
      'https:///example.test',
      'https://example.test:0'
    ])('rejects a URL outside the former IsUrl contract without throwing: %s', (url) => {
      expect(httpUrlSchema.safeParse(url).success).toBe(false)
    })
  })

  describe('optionalHttpBaseUrlSchema', () => {
    it('trims the URL without changing its trailing slash', () => {
      expect(optionalHttpBaseUrlSchema.parse('  https://editor.example.test/subpath/  ')).toBe('https://editor.example.test/subpath/')
      expect(optionalHttpBaseUrlSchema.parse('http://onlyoffice:80/')).toBe('http://onlyoffice:80/')
      expect(optionalHttpBaseUrlSchema.parse('http://[2001:db8::1]:8080/')).toBe('http://[2001:db8::1]:8080/')
    })

    it('normalizes an empty value to null', () => {
      expect(optionalHttpBaseUrlSchema.parse('   ')).toBeNull()
      expect(optionalHttpBaseUrlSchema.parse(null)).toBeNull()
    })

    it.each([
      'ftp://editor.example.test',
      'https://user:password@editor.example.test',
      'https://editor.example.test/path?token=secret',
      'https://editor.example.test/path#fragment',
      'https://editor.example.test@evil.example.test',
      'https://@editor.example.test',
      'https://editor_server.example.test',
      'https://-editor.example.test',
      'https://editor-.example.test',
      'https://editor..example.test',
      'https://.editor.example.test',
      'https://editor.example.test./',
      'https:///editor.example.test',
      'https://editor.example.test:0',
      'not-a-url'
    ])('rejects a non-base HTTP URL: %s', (url) => {
      expect(optionalHttpBaseUrlSchema.safeParse(url).success).toBe(false)
    })
  })

  it('keeps StandardSchema validation errors in the array format handled by the frontend', async () => {
    const pipe = new StandardSchemaValidationPipe()

    try {
      await pipe.transform({ externalServer: 'not-a-url' }, { type: 'body', schema: z.object({ externalServer: optionalHttpBaseUrlSchema }) })
      expect.unreachable('validation should fail')
    } catch (error) {
      const response = (error as HttpException).getResponse() as { error: string; message: string[]; statusCode: number }
      expect(response.statusCode).toBe(400)
      expect(response.error).toBe('Bad Request')
      expect(response.message).toEqual([expect.stringContaining('externalServer:')])
    }
  })
})
