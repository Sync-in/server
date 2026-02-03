import { Global, Module } from '@nestjs/common'
import { ContextInterceptor } from './interceptors/context.interceptor'
import { ContextManager } from './services/context-manager.service'

@Global()
@Module({
  providers: [ContextManager, ContextInterceptor],
  exports: [ContextManager, ContextInterceptor]
})
export class ContextModule {}
