import { lookup } from 'node:dns/promises'
import { HttpService } from '@nestjs/axios'
import { HttpStatus, Logger } from '@nestjs/common'
import { Readable } from 'node:stream'
import { HTTP_METHOD } from '../../applications.constants'
import { FileError } from '../models/file-error'
import { writeUploadFromStream } from './files'
import { DownloadFile } from './download-file'
import type { Mock } from 'vitest'
import { FILE_ERROR } from '../constants/errors'

vi.mock('./files', () => ({
  writeUploadFromStream: vi.fn()
}))
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn()
}))

describe(DownloadFile.name, () => {
  let http: { axiosRef: Mock }
  const lookupMock = lookup as Mock

  const blockedRemoteAddresses = [
    '10.0.0.1',
    '100.64.0.0',
    '127.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '192.0.2.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
    '999.1.1.1'
  ]

  const publicRemoteAddresses = ['8.8.8.8', '100.128.0.0', '172.32.0.0', '2001:4860:4860::8888', '::ffff:8.8.8.8']

  const response = (remoteAddress: string | undefined, headers: Record<string, string> = {}, status = 200) => ({
    status,
    headers,
    request: { socket: { remoteAddress } }
  })

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    http = { axiosRef: vi.fn() }
    lookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    vi.mocked(writeUploadFromStream).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it.each(blockedRemoteAddresses)('rejects blocked remote address "%s" on HEAD by default', async (remoteAddress) => {
    http.axiosRef.mockResolvedValueOnce(response(remoteAddress, { 'content-length': '12' }))

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')
    ).rejects.toEqual(new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP))

    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(http.axiosRef).toHaveBeenCalledWith(
      expect.objectContaining({ method: HTTP_METHOD.HEAD, url: 'https://example.test/file.txt', maxRedirects: 0 })
    )
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('rejects blocked DNS resolutions before calling HEAD', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')
    ).rejects.toEqual(new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP))

    expect(lookupMock).toHaveBeenCalledWith('example.test', { all: true, order: 'verbatim' })
    expect(http.axiosRef).not.toHaveBeenCalled()
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('rejects mixed DNS resolutions when one address is blocked', async () => {
    lookupMock.mockResolvedValueOnce([
      { address: '8.8.8.8', family: 4 },
      { address: '::1', family: 6 }
    ])

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')
    ).rejects.toEqual(new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP))

    expect(http.axiosRef).not.toHaveBeenCalled()
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('follows a safe redirect manually', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }])
    http.axiosRef
      .mockResolvedValueOnce(response('8.8.8.8', { location: 'https://cdn.example.test/file.txt' }, 302))
      .mockResolvedValueOnce(response('1.1.1.1', { 'content-length': '12', 'content-type': 'text/plain' }))

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', { getContentInfo: true })
    ).resolves.toEqual({
      contentLength: 12,
      contentType: 'text/plain',
      lastModified: undefined
    })

    expect(http.axiosRef).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: HTTP_METHOD.HEAD, url: 'https://example.test/file.txt', maxRedirects: 0 })
    )
    expect(http.axiosRef).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: HTTP_METHOD.HEAD, url: 'https://cdn.example.test/file.txt', maxRedirects: 0 })
    )
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('rejects a redirect to a blocked DNS resolution before following it', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
    http.axiosRef.mockResolvedValueOnce(response('8.8.8.8', { location: 'https://internal.example.test/file.txt' }, 302))

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')
    ).rejects.toEqual(new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP))

    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('rejects a missing remote address on HEAD by default', async () => {
    http.axiosRef.mockResolvedValueOnce(response(undefined, { 'content-length': '12' }))

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')
    ).rejects.toEqual(new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP))

    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it.each(publicRemoteAddresses)('allows public remote address "%s" on HEAD by default', async (remoteAddress) => {
    http.axiosRef.mockResolvedValueOnce(response(remoteAddress, { 'content-length': '12', 'content-type': 'text/plain' }))

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', { getContentInfo: true })
    ).resolves.toEqual({
      contentLength: 12,
      contentType: 'text/plain',
      lastModified: undefined
    })

    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(http.axiosRef).toHaveBeenCalledWith(
      expect.objectContaining({
        decompress: false,
        headers: { 'Accept-Encoding': 'identity' },
        httpAgent: expect.any(Object),
        httpsAgent: expect.any(Object)
      })
    )
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('uses a guarded agent lookup for connection-time resolutions', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
    http.axiosRef.mockImplementationOnce(
      (config: {
        httpAgent: {
          options: { lookup: (hostname: string, options: Record<string, unknown>, callback: (e: Error | null) => void) => void }
        }
      }) =>
        new Promise((resolve, reject) => {
          config.httpAgent.options.lookup('redirect.test', {}, (e: Error | null) => {
            if (e) {
              reject(e)
            } else {
              resolve(response('8.8.8.8', { 'content-length': '12', 'content-type': 'text/plain' }))
            }
          })
        })
    )

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', { getContentInfo: true })
    ).rejects.toEqual(new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP))

    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('allows private IPs on HEAD when allowPrivateIP is enabled for content info', async () => {
    http.axiosRef.mockResolvedValueOnce(
      response('127.0.0.1', {
        'content-length': '12',
        'content-type': 'image/png',
        'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT'
      })
    )

    const result = await new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/avatar.png' }, '/tmp/avatar.png', {
      allowPrivateIP: true,
      getContentInfo: true
    })

    expect(result).toEqual({
      contentLength: 12,
      contentType: 'image/png',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
    })
    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('rejects private IPs on GET by default and closes the stream', async () => {
    const stream = Readable.from(['abc'])
    const destroySpy = vi.spyOn(stream, 'destroy')
    http.axiosRef
      .mockResolvedValueOnce(response('8.8.8.8', { 'content-length': '12' }))
      .mockResolvedValueOnce({ ...response('10.0.0.7'), data: stream })

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')
    ).rejects.toEqual(new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP))

    expect(destroySpy).toHaveBeenCalled()
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it.each(['', '-1', '1.5', 'Infinity', '9007199254740992', 'abc'])('rejects invalid content-length "%s"', async (contentLength) => {
    http.axiosRef.mockResolvedValueOnce(response('8.8.8.8', { 'content-length': contentLength }))

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')
    ).rejects.toEqual(new FileError(HttpStatus.BAD_REQUEST, FILE_ERROR.DOWNLOAD_INVALID_CONTENT_LENGTH))

    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('rejects a missing content-length when no explicit maximum is available', async () => {
    http.axiosRef.mockResolvedValueOnce(response('8.8.8.8'))

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')
    ).rejects.toEqual(new FileError(HttpStatus.BAD_REQUEST, FILE_ERROR.DOWNLOAD_INVALID_CONTENT_LENGTH))

    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('allows missing content-length when maxSize is provided', async () => {
    const stream = Readable.from(['abc'])
    http.axiosRef.mockResolvedValueOnce(response('8.8.8.8')).mockResolvedValueOnce({ ...response('8.8.8.8'), data: stream })

    await new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', {
      maxSize: 1024
    })

    expect(writeUploadFromStream).toHaveBeenCalledWith(
      '/tmp/file.txt',
      stream,
      expect.objectContaining({ limiter: expect.objectContaining({ consume: expect.any(Function) }) })
    )
  })

  it('allows missing content-length for space downloads when maxSize is provided', async () => {
    const stream = Readable.from(['abc'])
    const space = { storageQuota: 10, storageUsage: 7 }
    http.axiosRef.mockResolvedValueOnce(response('8.8.8.8')).mockResolvedValueOnce({ ...response('8.8.8.8'), data: stream })

    await new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', {
      space: space as any,
      maxSize: 1024
    })

    const options = vi.mocked(writeUploadFromStream).mock.calls[0][2]
    expect(() => options.limiter.consume(4)).toThrow(new FileError(HttpStatus.INSUFFICIENT_STORAGE, FILE_ERROR.STORAGE_QUOTA_EXCEEDED))
  })

  it('accepts a known content-length within the remaining quota', async () => {
    const stream = Readable.from(['abc'])
    const space = { storageQuota: 100, storageUsage: 88 }
    http.axiosRef
      .mockResolvedValueOnce(response('8.8.8.8', { 'content-length': '12' }))
      .mockResolvedValueOnce({ ...response('8.8.8.8'), data: stream })

    await new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', {
      space: space as any,
      maxSize: 1024
    })

    expect(writeUploadFromStream).toHaveBeenCalledWith(
      '/tmp/file.txt',
      stream,
      expect.objectContaining({ limiter: expect.objectContaining({ consume: expect.any(Function) }) })
    )
  })

  it('rejects a known content-length above the remaining quota before GET', async () => {
    const space = { storageQuota: 100, storageUsage: 89 }
    http.axiosRef.mockResolvedValueOnce(response('8.8.8.8', { 'content-length': '12' }))

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', {
        space: space as any,
        maxSize: 1024
      })
    ).rejects.toEqual(new FileError(HttpStatus.INSUFFICIENT_STORAGE, FILE_ERROR.STORAGE_QUOTA_EXCEEDED))

    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('rejects a space download exceeding maxSize before starting the GET request', async () => {
    const space = { storageQuota: null, storageUsage: 0 }
    http.axiosRef.mockResolvedValueOnce(response('8.8.8.8', { 'content-length': '1025' }))

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', {
        space: space as any,
        maxSize: 1024
      })
    ).rejects.toEqual(new FileError(HttpStatus.PAYLOAD_TOO_LARGE, FILE_ERROR.MAX_FILE_SIZE_EXCEEDED))

    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('forwards the progress callback to the stream writer', async () => {
    const stream = Readable.from(['abc'])
    const onProgress = vi.fn()
    http.axiosRef
      .mockResolvedValueOnce(response('8.8.8.8', { 'content-length': '12' }))
      .mockResolvedValueOnce({ ...response('8.8.8.8'), data: stream })

    await new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', {
      onProgress
    })

    expect(writeUploadFromStream).toHaveBeenCalledWith(
      '/tmp/file.txt',
      stream,
      expect.objectContaining({ limiter: expect.objectContaining({ consume: expect.any(Function) }), onProgress })
    )
  })

  it('allows zero content-length and guards the written stream at zero bytes', async () => {
    const stream = Readable.from([])
    http.axiosRef
      .mockResolvedValueOnce(response('8.8.8.8', { 'content-length': '0' }))
      .mockResolvedValueOnce({ ...response('8.8.8.8'), data: stream })

    await new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')

    expect(writeUploadFromStream).toHaveBeenCalledWith(
      '/tmp/file.txt',
      stream,
      expect.objectContaining({ limiter: expect.objectContaining({ consume: expect.any(Function) }) })
    )
  })

  it('rejects redirects on GET after the HEAD URL has been resolved', async () => {
    const stream = Readable.from(['abc'])
    const destroySpy = vi.spyOn(stream, 'destroy')
    http.axiosRef
      .mockResolvedValueOnce(response('8.8.8.8', { 'content-length': '12' }))
      .mockResolvedValueOnce({ ...response('8.8.8.8', { location: 'https://cdn.example.test/file.txt' }, 302), data: stream })

    await expect(
      new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt')
    ).rejects.toEqual(new FileError(HttpStatus.BAD_REQUEST, FILE_ERROR.DOWNLOAD_MAX_REDIRECTS_EXCEEDED))

    expect(http.axiosRef).toHaveBeenCalledTimes(2)
    expect(destroySpy).toHaveBeenCalled()
    expect(writeUploadFromStream).not.toHaveBeenCalled()
  })

  it('allows private IPs on GET when allowPrivateIP is enabled', async () => {
    const stream = Readable.from(['abc'])
    http.axiosRef
      .mockResolvedValueOnce(response('127.0.0.1', { 'content-length': '12' }))
      .mockResolvedValueOnce({ ...response('10.0.0.7'), data: stream })

    await new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', {
      allowPrivateIP: true
    })

    expect(writeUploadFromStream).toHaveBeenCalledWith(
      '/tmp/file.txt',
      stream,
      expect.objectContaining({ limiter: expect.objectContaining({ consume: expect.any(Function) }) })
    )
    expect(http.axiosRef).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: HTTP_METHOD.GET,
        url: 'https://example.test/file.txt',
        responseType: 'stream',
        decompress: false,
        headers: { 'Accept-Encoding': 'identity' },
        proxy: false,
        maxRedirects: 0
      })
    )
  })

  it('uses maxSize as the stream guard when provided', async () => {
    const stream = Readable.from(['abc'])
    http.axiosRef
      .mockResolvedValueOnce(response('8.8.8.8', { 'content-length': '12' }))
      .mockResolvedValueOnce({ ...response('8.8.8.8'), data: stream })

    await new DownloadFile(http as unknown as HttpService).download({ url: 'https://example.test/file.txt' }, '/tmp/file.txt', {
      maxSize: 1024
    })

    expect(writeUploadFromStream).toHaveBeenCalledWith(
      '/tmp/file.txt',
      stream,
      expect.objectContaining({ limiter: expect.objectContaining({ consume: expect.any(Function) }) })
    )
  })
})
