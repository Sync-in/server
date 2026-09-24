import { Controller, Get, Request, UseGuards, UseInterceptors } from '@nestjs/common'
import { ContextInterceptor } from '../../../../infrastructure/context/interceptors/context.interceptor'
import { SpaceGuard } from '../../../spaces/guards/space.guard'
import type { FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface'
import { DrawioManager } from './drawio-manager.service'
import type { DrawioSettingsDto } from './drawio.dtos'
import { DRAWIO_ROUTE } from './drawio.routes'

@Controller(DRAWIO_ROUTE.BASE)
@UseGuards(SpaceGuard)
export class DrawioController {
  constructor(private readonly drawioManager: DrawioManager) {}

  @Get(`${DRAWIO_ROUTE.DRAWIO}/${DRAWIO_ROUTE.SETTINGS}/*`)
  @UseInterceptors(ContextInterceptor)
  settings(@Request() req: FastifySpaceRequest): Promise<DrawioSettingsDto> {
    return this.drawioManager.getSettings(req.space)
  }
}
