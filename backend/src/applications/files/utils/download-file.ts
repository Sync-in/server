import { lookup } from 'node:dns/promises'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import type { LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'
import type { HttpService } from '@nestjs/axios'
import { HttpStatus, Logger } from '@nestjs/common'
import { AxiosHeaders, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import ipaddr from 'ipaddr.js'
import { HTTP_METHOD } from '../../applications.constants'
import type { SpaceEnv } from '../../spaces/models/space-env.model'
import type { DownloadFileDto } from '../dto/file-operations.dto'
import { FileTaskEvent } from '../events/file-events'
import type { DownloadFileContentInfo, DownloadFileOptions } from '../interfaces/download-file.interface'
import { FileError } from '../models/file-error'
import { writeUploadFromStream } from './files'
import { FILE_ERROR } from '../constants/errors'
import { createUploadStreamLimiter } from './upload-file'

interface DownloadFileRequestOptions {
  allowPrivateIP?: boolean
  maxRedirects?: number
}

type DownloadStage = 'head' | 'validation' | 'get' | 'stream'

export class DownloadFile {
  private readonly logger = new Logger(DownloadFile.name)
  private static readonly dnsOptions = { all: true, order: 'verbatim' } as const
  private static readonly maxRedirects = 1
  private static readonly redirectStatus = new Set([301, 302, 303, 307, 308])
  private readonly dnsCache = new Map<string, LookupAddress[]>()
  private readonly safeAgents = {
    httpAgent: new HttpAgent({ lookup: this.safeLookup.bind(this) }),
    httpsAgent: new HttpsAgent({ lookup: this.safeLookup.bind(this) })
  }

  constructor(private readonly http: HttpService) {}

  async download(
    downloadDto: DownloadFileDto,
    dstPath: string,
    options: DownloadFileOptions & { getContentInfo: true }
  ): Promise<DownloadFileContentInfo>
  async download(downloadDto: DownloadFileDto, dstPath: string, options?: DownloadFileOptions & { getContentInfo?: false | undefined }): Promise<void>
  async download(downloadDto: DownloadFileDto, dstPath: string, options?: DownloadFileOptions): Promise<void | DownloadFileContentInfo> {
    const identityEncodingConfig = { decompress: false, headers: { 'Accept-Encoding': 'identity' } }
    let stage: DownloadStage = 'head'
    let currentUrl = downloadDto.url
    let contentLength: number | null | undefined
    let maxSize: number | undefined

    try {
      const { response: headRes, url } = await this.request(
        currentUrl,
        { method: HTTP_METHOD.HEAD, signal: options?.signal, ...identityEncodingConfig },
        { allowPrivateIP: options?.allowPrivateIP }
      )
      currentUrl = url

      stage = 'validation'
      const headers = AxiosHeaders.from(headRes.headers)
      contentLength = this.contentLength(headers)
      if (options?.getContentInfo) {
        return {
          contentLength,
          contentType: `${headers.getContentType()}`,
          lastModified: headers.get('last-modified') as string | undefined
        } satisfies DownloadFileContentInfo
      }

      // An explicit maximum allows chunked downloads; otherwise HEAD content-length is the stream boundary.
      const streamMaxSize = options?.maxSize ?? contentLength
      if (streamMaxSize === null || streamMaxSize === undefined) {
        throw new FileError(HttpStatus.BAD_REQUEST, FILE_ERROR.DOWNLOAD_INVALID_CONTENT_LENGTH)
      }
      maxSize = streamMaxSize
      const fileLimiter = createUploadStreamLimiter(options?.space, streamMaxSize).createFileLimiter()
      if (contentLength !== null) {
        fileLimiter.assertKnownSize(contentLength)
      }
      this.prepareSpaceTask(options?.space, contentLength, options?.publishedPath || dstPath)

      // The HEAD request resolved redirects; the GET must target that final URL directly.
      stage = 'get'
      const { response: getRes } = await this.request(
        currentUrl,
        { method: HTTP_METHOD.GET, responseType: 'stream', signal: options?.signal, ...identityEncodingConfig },
        { allowPrivateIP: options?.allowPrivateIP, maxRedirects: 0 }
      )
      stage = 'stream'
      try {
        const getContentLength = this.contentLength(AxiosHeaders.from(getRes.headers))
        if (getContentLength !== null) {
          fileLimiter.assertKnownSize(getContentLength)
        }
      } catch (e) {
        getRes.data?.destroy?.()
        throw e
      }
      await writeUploadFromStream(dstPath, getRes.data, {
        limiter: fileLimiter,
        signal: options?.signal,
        onProgress: options?.onProgress
      })
    } catch (e) {
      this.logFailure(stage, currentUrl, e, options?.signal, contentLength, maxSize ?? options?.maxSize)
      throw e
    }
  }

  private logFailure(stage: DownloadStage, url: string, error: unknown, signal?: AbortSignal, contentLength?: number | null, maxSize?: number): void {
    if (signal?.aborted) return
    const host = URL.canParse(url) ? new URL(url).hostname || 'unknown' : 'invalid'
    const sizeContext =
      stage === 'validation' || stage === 'stream' ? ` (contentLength=${contentLength ?? 'missing'}, maxSize=${maxSize ?? 'unset'})` : ''
    this.logger.warn({ tag: this.download.name, msg: `${stage} failed for host *${host}*${sizeContext}: ${error}` })
  }

  private safeLookup(hostname: string, options: Parameters<LookupFunction>[1], cb: Parameters<LookupFunction>[2]): void {
    this.resolvePublic(hostname)
      .then((addresses) => {
        const family = options.family === 4 || options.family === 'IPv4' ? 4 : options.family === 6 || options.family === 'IPv6' ? 6 : null
        const matches = family ? addresses.filter((a) => a.family === family) : addresses
        if (!matches.length) return cb(new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP), '', 0)
        if (options.all) {
          cb(null, matches)
        } else {
          cb(null, matches[0].address, matches[0].family)
        }
      })
      .catch((e: Error) => cb(e as FileError, '', 0))
  }

  private async request(
    url: string,
    config: AxiosRequestConfig,
    options: DownloadFileRequestOptions = {}
  ): Promise<{ response: AxiosResponse; url: string }> {
    let currentUrl = url
    for (let redirects = 0; ; redirects++) {
      if (!options.allowPrivateIP) await this.resolvePublic(new URL(currentUrl).hostname)
      const response: AxiosResponse = await this.http.axiosRef({
        ...config,
        url: currentUrl,
        proxy: false,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        ...(options.allowPrivateIP ? {} : this.safeAgents)
      })
      try {
        this.checkRemote(response, options.allowPrivateIP)
      } catch (e) {
        response.data?.destroy?.()
        throw e
      }
      const nextUrl = this.redirectUrl(response, currentUrl)
      if (!nextUrl) return { response, url: currentUrl }

      response.data?.destroy?.()
      // Redirects are followed manually to re-run DNS and remote address checks on each hop.
      if (redirects >= (options.maxRedirects ?? DownloadFile.maxRedirects)) {
        throw new FileError(HttpStatus.BAD_REQUEST, FILE_ERROR.DOWNLOAD_MAX_REDIRECTS_EXCEEDED)
      }
      currentUrl = nextUrl
    }
  }

  private redirectUrl(response: AxiosResponse, currentUrl: string): string | null {
    if (!DownloadFile.redirectStatus.has(response.status)) return null
    const location = response.headers.location as string | undefined
    if (!location) throw new FileError(HttpStatus.BAD_REQUEST, FILE_ERROR.DOWNLOAD_MISSING_REDIRECT_LOCATION)

    const url = new URL(location, currentUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_UNSAFE_REDIRECT_LOCATION)
    }
    return url.toString()
  }

  private async resolvePublic(hostname: string): Promise<LookupAddress[]> {
    const key = this.normalizeHostname(hostname).toLowerCase()
    // Keep DNS answers stable within one download attempt and avoid a second resolution drift.
    const cached = this.dnsCache.get(key)
    if (cached) return cached

    const addresses = await lookup(key, DownloadFile.dnsOptions)
    if (!addresses.length || addresses.some((a) => this.isBlocked(a.address))) {
      throw new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP)
    }
    this.dnsCache.set(key, addresses)
    return addresses
  }

  private normalizeHostname(hostname: string): string {
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  }

  private checkRemote(response: AxiosResponse, allowPrivateIP?: boolean): void {
    if (!allowPrivateIP && this.isBlocked(response.request?.socket?.remoteAddress)) {
      throw new FileError(HttpStatus.FORBIDDEN, FILE_ERROR.DOWNLOAD_PRIVATE_IP)
    }
  }

  private isBlocked(address: string | undefined): boolean {
    return !address || !ipaddr.isValid(address) || ipaddr.process(address).range() !== 'unicast'
  }

  private contentLength(headers: AxiosHeaders): number | null {
    const value = headers.get('content-length')
    if (value === undefined || value === null) return null

    const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
    if (!/^\d+$/.test(normalized)) {
      throw new FileError(HttpStatus.BAD_REQUEST, FILE_ERROR.DOWNLOAD_INVALID_CONTENT_LENGTH)
    }
    const contentLength = Number(normalized)
    if (!Number.isSafeInteger(contentLength)) {
      throw new FileError(HttpStatus.BAD_REQUEST, FILE_ERROR.DOWNLOAD_INVALID_CONTENT_LENGTH)
    }
    return contentLength
  }

  private prepareSpaceTask(space: SpaceEnv | undefined, contentLength: number | null, publishedPath: string): void {
    if (!space) return
    if (space.task?.cacheKey) {
      space.task.props = {
        ...space.task.props,
        progress: 1,
        size: 0,
        totalSize: contentLength ?? undefined
      }
      FileTaskEvent.emit('startWatch', space, publishedPath)
    }
  }
}
