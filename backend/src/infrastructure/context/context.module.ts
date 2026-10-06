import { Global, Module } from '@nestjs/common'
import { ContextInterceptor } from './interceptors/context.interceptor.js'
import { ContextManager } from './services/context-manager.service.js'

@Global()
@Module({
  providers: [ContextManager, ContextInterceptor],
  exports: [ContextManager, ContextInterceptor]
})
export class ContextModule {}
