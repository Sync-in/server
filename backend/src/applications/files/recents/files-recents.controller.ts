import { Controller, Get, Query } from '@nestjs/common'
import { GetUser } from '../../users/decorators/user.decorator.js'
import { UserModel } from '../../users/models/user.model.js'
import { FILES_ROUTE } from '../core/constants/routes.js'
import { filesRecentsLimitQuerySchema } from '../core/schemas/files-validation.schema.js'
import { FILES_RECENTS_DEFAULT_LIMIT, FILES_RECENTS_MAX_LIMIT } from './constants/recents.js'
import type { FileRecent } from './schemas/file-recent.interface.js'
import { FilesRecents } from './services/files-recents.service.js'

@Controller(FILES_ROUTE.BASE)
export class FilesRecentsController {
  constructor(private readonly filesRecents: FilesRecents) {}

  @Get(FILES_ROUTE.RECENTS)
  getRecents(
    @GetUser() user: UserModel,
    @Query('limit', { schema: filesRecentsLimitQuerySchema }) limit: number = FILES_RECENTS_DEFAULT_LIMIT
  ): Promise<FileRecent[]> {
    return this.filesRecents.getRecents(user, Math.min(limit, FILES_RECENTS_MAX_LIMIT))
  }
}
