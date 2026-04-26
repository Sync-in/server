import type { HttpService } from '@nestjs/axios'
import type { SpaceEnv } from '../../spaces/models/space-env.model'
import type { AxiosResponse } from 'axios'
import { HTTP_METHOD } from '../../applications.constants'
import { FileError } from '../models/file-error'
import { HttpStatus } from '@nestjs/common'
import { FileTaskEvent } from '../events/file-events'
import { FILE_OPERATION } from '../constants/operations'
import { writeFromStream } from './files'
import type { DownloadFileDto } from '../dto/file-operations.dto'
import type { DownloadFileContentInfo, DownloadFileOptions } from '../interfaces/download-file.interface'

const parts = [
  // IPv4 loopback (127.0.0.0/8)
  '127\\.(?:\\d{1,3}\\.){2}\\d{1,3}',
  // IPv4 link-local (169.254.0.0/16)
  '169\\.254\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 Carrier-grade NAT (100.64.0.0/10)
  '100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 private (10.0.0.0/8)
  '10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 private (192.168.0.0/16)
  '192\\.168\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 private (172.16.0.0/12)
  '172\\.(?:1[6-9]|2\\d|3[0-1])\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 & IPv6 loopback
  '::1',
  '::',
  '0.0.0.0',
  // IPv6 Unique Local Address (fc00::/7)
  'f[cd][0-9a-f]{2}:[0-9a-f:]+',
  // IPv6 link-local (fe80::/10)
  'fe[89ab][0-9a-f]{2}:[0-9a-f:]+'
]

const regExpPrivateIP = new RegExp(`^(?:${parts.join('|')})$`, 'i')
const errorRegexpPrivateIP = 'Access to internal IP addresses is forbidden'

export async function downloadFile(
  http: HttpService,
  downloadDto: DownloadFileDto,
  dstPath: string,
  options: { space?: SpaceEnv; getContentInfo: true }
): Promise<DownloadFileContentInfo>
export async function downloadFile(
  http: HttpService,
  downloadDto: DownloadFileDto,
  dstPath: string,
  options?: { space?: SpaceEnv; getContentInfo?: false | undefined }
): Promise<void>
export async function downloadFile(
  http: HttpService,
  downloadDto: DownloadFileDto,
  dstPath: string,
  options?: DownloadFileOptions
): Promise<void | DownloadFileContentInfo> {
  // dto must be validated by the caller
  const headRes: AxiosResponse = await http.axiosRef({ method: HTTP_METHOD.HEAD, url: downloadDto.url, maxRedirects: 1 })
  if (regExpPrivateIP.test(headRes.request.socket.remoteAddress)) {
    // prevent SSRF attack
    throw new FileError(HttpStatus.FORBIDDEN, errorRegexpPrivateIP)
  }

  // attempt to retrieve the Content-Length header
  const contentLength = 'content-length' in headRes.headers ? Number(headRes.headers['content-length']) || null : null
  if (options?.getContentInfo) {
    return {
      contentLength: contentLength,
      contentType: `${headRes.headers['content-type']}`,
      lastModified: headRes.headers['last-modified'] as string | undefined
    } satisfies DownloadFileContentInfo
  }

  if (!contentLength) {
    throw new FileError(HttpStatus.BAD_REQUEST, 'Missing "content-length" header')
  }

  if (options?.space) {
    if (options.space.willExceedQuota(contentLength)) {
      throw new FileError(HttpStatus.INSUFFICIENT_STORAGE, 'Storage quota will be exceeded')
    }
    // tasking
    if (options.space.task?.cacheKey) {
      options.space.task.props.totalSize = contentLength
      FileTaskEvent.emit('startWatch', options.space, FILE_OPERATION.DOWNLOAD, dstPath)
    }
  }

  const getRes = await http.axiosRef({ method: HTTP_METHOD.GET, url: downloadDto.url, responseType: 'stream', maxRedirects: 1 })
  if (regExpPrivateIP.test(getRes.request.socket.remoteAddress)) {
    // close request
    getRes.data?.destroy()
    // Prevent SSRF attacks and perform a DNS-rebinding check if a HEAD request has already been made
    throw new FileError(HttpStatus.FORBIDDEN, errorRegexpPrivateIP)
  }
  await writeFromStream(dstPath, getRes.data)
}
