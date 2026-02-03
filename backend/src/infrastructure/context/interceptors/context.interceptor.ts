import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import type { Observable } from 'rxjs'
import { ContextManager } from '../services/context-manager.service'

@Injectable()
export class ContextInterceptor implements NestInterceptor {
  constructor(private readonly contextService: ContextManager) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req: FastifyRequest = context.switchToHttp().getRequest()
    return this.contextService.run({ headerOriginUrl: req.headers.origin || `${req.protocol}://${req.headers.host}` }, () => next.handle())
  }
}
