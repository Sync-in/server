import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseEnumPipe,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { type FastifyReply } from 'fastify'
import { ContextInterceptor } from '../../../../infrastructure/context/interceptors/context.interceptor.js'
import { SPACE_OPERATION } from '../../../spaces/constants/spaces.js'
import { OverrideSpacePermission } from '../../../spaces/decorators/space-override-permission.decorator.js'
import { GetSpace } from '../../../spaces/decorators/space.decorator.js'
import { SpaceGuard } from '../../../spaces/guards/space.guard.js'
import { type FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface.js'
import { SpaceEnv } from '../../../spaces/models/space-env.model.js'
import { USER_THEME } from '../../../users/constants/user-preferences.js'
import { GetUser } from '../../../users/decorators/user.decorator.js'
import type { UserTheme } from '../../../users/interfaces/user-preferences.interface.js'
import { UserModel } from '../../../users/models/user.model.js'
import { FilesMethods } from '../../services/files-methods.service.js'
import { OnlyOfficeEnvironment } from './only-office-environment.decorator.js'
import { OnlyOfficeManager } from './only-office-manager.service.js'
import type { OnlyOfficeReqDto } from './only-office.dtos.js'
import { API_ONLY_OFFICE, ONLY_OFFICE_ROUTE } from './only-office.routes.js'

@Controller(API_ONLY_OFFICE)
export class OnlyOfficeController {
  constructor(
    private readonly filesMethods: FilesMethods,
    private readonly filesOnlyOfficeManager: OnlyOfficeManager
  ) {}

  @Get(`${ONLY_OFFICE_ROUTE.SETTINGS}/*`)
  @UseGuards(SpaceGuard)
  @UseInterceptors(ContextInterceptor)
  onlyOfficeSettings(
    @Request() req: FastifySpaceRequest,
    @Query('theme', new ParseEnumPipe({ DARK: USER_THEME.DARK, LIGHT: USER_THEME.LIGHT }, { optional: true })) theme?: UserTheme
  ): Promise<OnlyOfficeReqDto> {
    return this.filesOnlyOfficeManager.getSettings(req.user, req.space, req, theme)
  }

  @Get(`${ONLY_OFFICE_ROUTE.DOCUMENT}/*`)
  @OnlyOfficeEnvironment()
  onlyOfficeDocument(@Request() req: FastifySpaceRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<StreamableFile> {
    return this.filesMethods.headOrGet(req, res)
  }

  @Post(`${ONLY_OFFICE_ROUTE.CALLBACK}/*`)
  @OnlyOfficeEnvironment()
  @OverrideSpacePermission(SPACE_OPERATION.MODIFY)
  @HttpCode(HttpStatus.OK)
  onlyOfficeCallBack(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body('token') token: string) {
    return this.filesOnlyOfficeManager.callBack(user, space, token)
  }
}
