import { HttpService } from '@nestjs/axios'
import { HttpStatus } from '@nestjs/common'
import { Readable } from 'node:stream'
import { HTTP_METHOD } from '../../applications.constants'
import { FileError } from '../models/file-error'
import { writeFromStream } from './files'
import { downloadFile } from './download-file'

jest.mock('./files', () => ({
  writeFromStream: jest.fn()
}))

describe(downloadFile.name, () => {
  let http: { axiosRef: jest.Mock }

  const response = (remoteAddress: string, headers: Record<string, string> = {}) => ({
    headers,
    request: { socket: { remoteAddress } }
  })

  beforeEach(() => {
    http = { axiosRef: jest.fn() }
    ;(writeFromStream as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('rejects private IPs on HEAD by default', async () => {
    http.axiosRef.mockResolvedValueOnce(response('127.0.0.1', { 'content-length': '12' }))

    await expect(downloadFile(http as unknown as HttpService, { url: 'https://example.test/file.txt' }, '/tmp/file.txt')).rejects.toEqual(
      new FileError(HttpStatus.FORBIDDEN, 'Access to internal IP addresses is forbidden')
    )

    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(http.axiosRef).toHaveBeenCalledWith({ method: HTTP_METHOD.HEAD, url: 'https://example.test/file.txt', maxRedirects: 1 })
    expect(writeFromStream).not.toHaveBeenCalled()
  })

  it('allows private IPs on HEAD when allowPrivateIP is enabled for content info', async () => {
    http.axiosRef.mockResolvedValueOnce(
      response('127.0.0.1', {
        'content-length': '12',
        'content-type': 'image/png',
        'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT'
      })
    )

    const result = await downloadFile(http as unknown as HttpService, { url: 'https://example.test/avatar.png' }, '/tmp/avatar.png', {
      allowPrivateIP: true,
      getContentInfo: true
    })

    expect(result).toEqual({
      contentLength: 12,
      contentType: 'image/png',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
    })
    expect(http.axiosRef).toHaveBeenCalledTimes(1)
    expect(writeFromStream).not.toHaveBeenCalled()
  })

  it('rejects private IPs on GET by default and closes the stream', async () => {
    const stream = Readable.from(['abc'])
    const destroySpy = jest.spyOn(stream, 'destroy')
    http.axiosRef
      .mockResolvedValueOnce(response('8.8.8.8', { 'content-length': '12' }))
      .mockResolvedValueOnce({ ...response('10.0.0.7'), data: stream })

    await expect(downloadFile(http as unknown as HttpService, { url: 'https://example.test/file.txt' }, '/tmp/file.txt')).rejects.toEqual(
      new FileError(HttpStatus.FORBIDDEN, 'Access to internal IP addresses is forbidden')
    )

    expect(destroySpy).toHaveBeenCalled()
    expect(writeFromStream).not.toHaveBeenCalled()
  })

  it('allows private IPs on GET when allowPrivateIP is enabled', async () => {
    const stream = Readable.from(['abc'])
    http.axiosRef
      .mockResolvedValueOnce(response('127.0.0.1', { 'content-length': '12' }))
      .mockResolvedValueOnce({ ...response('10.0.0.7'), data: stream })

    await downloadFile(http as unknown as HttpService, { url: 'https://example.test/file.txt' }, '/tmp/file.txt', { allowPrivateIP: true })

    expect(writeFromStream).toHaveBeenCalledWith('/tmp/file.txt', stream)
  })
})
