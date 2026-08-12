import { HttpStatus } from '@nestjs/common'
import { FILE_ERROR } from '../constants/errors'
import { FileError } from '../models/file-error'
import { parseContentLength, parseContentRange, UploadStreamLimiter } from './upload-file'

describe(UploadStreamLimiter.name, () => {
  it('short-circuits a known file size above maxUploadSize', () => {
    const fileLimiter = new UploadStreamLimiter(10).createFileLimiter()

    expect(() => fileLimiter.assertKnownSize(11)).toThrow(new FileError(HttpStatus.PAYLOAD_TOO_LARGE, FILE_ERROR.MAX_FILE_SIZE_EXCEEDED))
  })

  it('short-circuits a known file size above the remaining quota', () => {
    const fileLimiter = new UploadStreamLimiter(100, 4).createFileLimiter()

    expect(() => fileLimiter.assertKnownSize(5)).toThrow(new FileError(HttpStatus.INSUFFICIENT_STORAGE, FILE_ERROR.STORAGE_QUOTA_EXCEEDED))
  })

  it('checks each streamed chunk before accepting it', () => {
    const fileLimiter = new UploadStreamLimiter(5).createFileLimiter()

    fileLimiter.consume(3)
    expect(() => fileLimiter.consume(3)).toThrow(new FileError(HttpStatus.PAYLOAD_TOO_LARGE, FILE_ERROR.MAX_FILE_SIZE_EXCEEDED))
  })

  it('shares quota consumption across multipart files', () => {
    const limiter = new UploadStreamLimiter(100, 6)
    limiter.createFileLimiter().consume(4)

    const secondFile = limiter.createFileLimiter()
    secondFile.consume(2)
    expect(() => secondFile.consume(1)).toThrow(new FileError(HttpStatus.INSUFFICIENT_STORAGE, FILE_ERROR.STORAGE_QUOTA_EXCEEDED))
  })

  it('includes a range offset in maxUploadSize but not in newly consumed quota', () => {
    const limiter = new UploadStreamLimiter(10, 5)
    const rangedFile = limiter.createFileLimiter(8)

    expect(rangedFile.initialFileSize).toBe(8)
    rangedFile.assertFinalSize(10)
    rangedFile.consume(2)
    const secondFile = limiter.createFileLimiter()
    expect(() => secondFile.consume(3)).not.toThrow()
    expect(() => secondFile.consume(1)).toThrow(new FileError(HttpStatus.INSUFFICIENT_STORAGE, FILE_ERROR.STORAGE_QUOTA_EXCEEDED))
  })

  it('rejects a final size below the current range offset', () => {
    const rangedFile = new UploadStreamLimiter(10).createFileLimiter(8)

    expect(() => rangedFile.assertFinalSize(7)).toThrow(new FileError(HttpStatus.BAD_REQUEST, 'Invalid upload size'))
  })
})

describe(parseContentLength.name, () => {
  it('returns undefined when the header is absent', () => {
    expect(parseContentLength(undefined)).toBeUndefined()
  })

  it('parses a valid byte count', () => {
    expect(parseContentLength(' 42 ')).toBe(42)
  })

  it.each(['-1', '1.5', 'abc', '9007199254740992'])('rejects invalid content-length "%s"', (value) => {
    expect(() => parseContentLength(value)).toThrow(new FileError(HttpStatus.BAD_REQUEST, 'Invalid "content-length" header'))
  })
})

describe(parseContentRange.name, () => {
  const malformedRanges = ['bytes 5-4/10', 'bytes 0-10/10', 'bytes nope', 'bytes 9007199254740992-9007199254740993/*']

  it('parses ranges with a known or unknown total size', () => {
    expect(parseContentRange('bytes 5-9/10')).toEqual({ start: 5, end: 9, total: 10 })
    expect(parseContentRange('bytes 5-9/*')).toEqual({ start: 5, end: 9 })
  })

  it.each(malformedRanges)('rejects malformed range "%s"', (value) => {
    expect(() => parseContentRange(value)).toThrow(new FileError(HttpStatus.BAD_REQUEST, 'Content-range : header is malformed'))
  })
})
