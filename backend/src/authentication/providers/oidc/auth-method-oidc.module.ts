/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Module } from '@nestjs/common'
import { AuthOIDCController } from './auth-oidc.controller'
import { AuthProviderOIDC } from './auth-provider-oidc.service'

@Module({
  controllers: [AuthOIDCController],
  providers: [AuthProviderOIDC],
  exports: [AuthProviderOIDC]
})
export class AuthMethodOIDCModule {}
