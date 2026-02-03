import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { buffer } from 'node:stream/consumers'
import zlib from 'node:zlib'
import { Observable } from 'rxjs'

@Injectable()
export class SyncDiffGzipBodyInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req: FastifyRequest = context.switchToHttp().getRequest()
    if (req.headers['content-encoding'] === 'gzip') {
      const body: Buffer<ArrayBufferLike> = await buffer(req.raw)
      await new Promise<void>((resolve, reject) => {
        zlib.gunzip(body, (err: Error, decoded: Buffer<ArrayBufferLike>) => {
          if (err) {
            return reject(new HttpException('Invalid gzip body', HttpStatus.BAD_REQUEST))
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
}
