import { Module } from '@nestjs/common'
import { AuthOIDCController } from './auth-oidc.controller'
import { AuthProviderOIDC } from './auth-provider-oidc.service'

@Module({
  controllers: [AuthOIDCController],
  providers: [AuthProviderOIDC],
  exports: [AuthProviderOIDC]
})
export class AuthProviderOIDCModule {}
