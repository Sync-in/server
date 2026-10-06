import { BadRequestException, Body, Controller, Delete, Get, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { SkipSpaceGuard } from '../spaces/decorators/space-skip-guard.decorator.js'
import { SkipSpacePermissionsCheck } from '../spaces/decorators/space-skip-permissions.decorator.js'
import { GetSpace } from '../spaces/decorators/space.decorator.js'
import { SpaceGuard } from '../spaces/guards/space.guard.js'
import { SpaceEnv } from '../spaces/models/space-env.model.js'
import { GetUser } from '../users/decorators/user.decorator.js'
import type { UserModel } from '../users/models/user.model.js'
import { COMMENTS_RECENTS_DEFAULT_LIMIT, COMMENTS_RECENTS_MAX_LIMIT } from './constants/recents.js'
import { COMMENTS_ROUTE } from './constants/routes.js'
import { CreateOrUpdateCommentDto, DeleteCommentDto } from './dto/comment.dto.js'
import { CommentRecent } from './interfaces/comment-recent.interface.js'
import { Comment } from './schemas/comment.interface.js'
import { CommentsManager } from './services/comments-manager.service.js'

@Controller(COMMENTS_ROUTE.BASE)
@SkipSpacePermissionsCheck()
@UseGuards(SpaceGuard)
export class CommentsController {
  constructor(private readonly commentsManager: CommentsManager) {}

  @Get(`${COMMENTS_ROUTE.SPACES}/*`)
  getFromSpace(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv): Promise<Comment[]> {
    return this.commentsManager.getComments(user, space)
  }

  @Post(`${COMMENTS_ROUTE.SPACES}/*`)
  createFromSpace(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body() createCommentDto: CreateOrUpdateCommentDto): Promise<Comment> {
    return this.commentsManager.createComment(user, space, createCommentDto)
  }

  @Patch(`${COMMENTS_ROUTE.SPACES}/*`)
  updateFromSpace(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body() updateCommentDto: CreateOrUpdateCommentDto): Promise<Comment> {
    return this.commentsManager.updateComment(user, space, updateCommentDto)
  }

  @Delete(`${COMMENTS_ROUTE.SPACES}/*`)
  deleteFromSpace(@GetUser() user: UserModel, @GetSpace() space: SpaceEnv, @Body() deleteCommentDto: DeleteCommentDto): Promise<void> {
    return this.commentsManager.deleteComment(user, space, deleteCommentDto)
  }

  @Get(COMMENTS_ROUTE.RECENTS)
  @SkipSpaceGuard()
  getRecents(
    @GetUser() user: UserModel,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = COMMENTS_RECENTS_DEFAULT_LIMIT
  ): Promise<CommentRecent[]> {
    if (!Number.isInteger(limit) || limit < 1) throw new BadRequestException('limit must be a positive integer')
    return this.commentsManager.getRecents(user, Math.min(limit, COMMENTS_RECENTS_MAX_LIMIT))
  }
}
