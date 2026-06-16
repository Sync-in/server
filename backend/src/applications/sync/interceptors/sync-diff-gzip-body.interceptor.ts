import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { IncomingMessage } from 'node:http'
import zlib from 'node:zlib'
import { Observable } from 'rxjs'

export const MAX_COMPRESSED_SYNC_DIFF_BODY_SIZE = 25 * 1024 * 1024
export const MAX_DECOMPRESSED_SYNC_DIFF_BODY_SIZE = 50 * 1024 * 1024

@Injectable()
export class SyncDiffGzipBodyInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req: FastifyRequest = context.switchToHttp().getRequest()
    if (req.headers['content-encoding'] === 'gzip') {
      const body: Buffer<ArrayBufferLike> = await this.readBody(req.raw)
      await new Promise<void>((resolve, reject) => {
        zlib.gunzip(body, { maxOutputLength: MAX_DECOMPRESSED_SYNC_DIFF_BODY_SIZE }, (err: Error, decoded: Buffer<ArrayBufferLike>) => {
          if (err) {
            return reject(new HttpException('Invalid gzip body', this.gzipErrorStatus(err)))
          }
          try {
            req.body = JSON.parse(decoded.toString())
            resolve()
          } catch (e) {
            reject(new HttpException(`Invalid JSON : ${e}`, HttpStatus.BAD_REQUEST))
          }
        })
      })
    }
    return next.handle()
  }

  private readBody(raw: IncomingMessage): Promise<Buffer<ArrayBufferLike>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      let bodyTooLarge = false

      raw.on('data', (chunk: Buffer) => {
        if (bodyTooLarge) {
          return
        }
        size += chunk.length
        if (size > MAX_COMPRESSED_SYNC_DIFF_BODY_SIZE) {
          bodyTooLarge = true
          reject(new HttpException('Gzip body is too large', HttpStatus.PAYLOAD_TOO_LARGE))
          raw.destroy()
          return
        }
        chunks.push(chunk)
      })
      raw.on('end', () => {
        if (!bodyTooLarge) {
          resolve(Buffer.concat(chunks))
        }
      })
      raw.on('error', (e) => {
        if (!bodyTooLarge) {
          reject(e)
        }
      })
    })
  }

  private gzipErrorStatus(err: Error): HttpStatus {
    return err.message.includes('maxOutputLength') || err.message.includes('larger than') ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST
  }
}
