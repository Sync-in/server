import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import path from 'node:path'
import { configuration } from '../../../../configuration/config.environment'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service'
import type { SpaceEnv } from '../../../spaces/models/space-env.model'
import { isPathExists, isPathIsDir } from '../../utils/files'
import { DRAWIO_INTERNAL_URI, DRAWIO_SUPPORTED_EXTENSIONS } from './drawio.constants'
import type { DrawioSettingsDto } from './drawio.dtos'

@Injectable()
export class DrawioManager {
  private readonly externalDrawioServer = configuration.applications.files.editors.drawio.externalServer || null

  constructor(private readonly contextManager: ContextManager) {}

  async getSettings(space: SpaceEnv): Promise<DrawioSettingsDto> {
    if (!(await isPathExists(space.realPath))) {
      throw new HttpException('Diagram not found', HttpStatus.NOT_FOUND)
    }
    if (await isPathIsDir(space.realPath)) {
      throw new HttpException('Diagram must be a file', HttpStatus.BAD_REQUEST)
    }
    const extension = path.extname(space.realPath).slice(1).toLowerCase()
    if (!DRAWIO_SUPPORTED_EXTENSIONS.has(extension)) {
      throw new HttpException('Diagram format not supported', HttpStatus.BAD_REQUEST)
    }

    return { documentServerUrl: this.documentServerUrl() }
  }

  private documentServerUrl(): string {
    if (this.externalDrawioServer) return this.externalDrawioServer
    const publicOrigin = this.contextManager.publicOriginUrl()
    if (!publicOrigin) {
      throw new HttpException('Draw.io public URL is unavailable', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return new URL(DRAWIO_INTERNAL_URI, publicOrigin).toString()
  }
}
