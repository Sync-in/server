/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Body, Controller, Get, Param, Post, Req, Res, StreamableFile } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { AuthTokenOptional } from '../../authentication/decorators/auth-token-optional.decorator'
import { LoginResponseDto } from '../../authentication/dto/login-response.dto'
import { GetUser } from '../users/decorators/user.decorator'
import { UserPasswordDto } from '../users/dto/user-properties.dto'
import { UserModel } from '../users/models/user.model'
import { PUBLIC_LINKS_ROUTE } from './constants/routes'
import { SpaceLink } from './interfaces/link-space.interface'
import { LinksManager } from './services/links-manager.service'

@Controller(PUBLIC_LINKS_ROUTE.BASE)
@AuthTokenOptional()
export class LinksController {
  constructor(private readonly linksPublicManager: LinksManager) {}

  @Get(`${PUBLIC_LINKS_ROUTE.VALIDATION}/:uuid`)
  linkValidation(
    @GetUser() user: UserModel,
    @Param('uuid') uuid: string
  ): Promise<{
    error: string | true
    ok: boolean
    link: SpaceLink
  }> {
    return this.linksPublicManager.linkValidation(user, uuid)
  }

  @Get(`${PUBLIC_LINKS_ROUTE.ACCESS}/:uuid`)
  linkAccess(
    @GetUser() user: UserModel,
    @Param('uuid') uuid: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<StreamableFile | LoginResponseDto> {
    return this.linksPublicManager.linkAccess(user, uuid, req, res)
  }

  @Post(`${PUBLIC_LINKS_ROUTE.AUTH}/:uuid`)
  linkAuthentication(
    @GetUser() user: UserModel,
    @Param('uuid') uuid: string,
    @Body() linkPasswordDto: UserPasswordDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<LoginResponseDto> {
    return this.linksPublicManager.linkAuthentication(user, uuid, linkPasswordDto, req, res)
  }
}
