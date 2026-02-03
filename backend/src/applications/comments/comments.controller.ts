import { Body, Controller, Delete, Get, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ContextInterceptor } from '../../infrastructure/context/interceptors/context.interceptor'
import { SkipSpaceGuard } from '../spaces/decorators/space-skip-guard.decorator'
import { SkipSpacePermissionsCheck } from '../spaces/decorators/space-skip-permissions.decorator'
import { GetSpace } from '../spaces/decorators/space.decorator'
import { SpaceGuard } from '../spaces/guards/space.guard'
import { SpaceEnv } from '../spaces/models/space-env.model'
import { GetUser } from '../users/decorators/user.decorator'
import type { UserModel } from '../users/models/user.model'
import { COMMENTS_ROUTE } from './constants/routes'
import { CreateOrUpdateCommentDto, DeleteCommentDto } from './dto/comment.dto'
import { CommentRecent } from './interfaces/comment-recent.interface'
import { Comment } from './schemas/comment.interface'
import { CommentsManager } from './services/comments-manager.service'

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
  @UseInterceptors(ContextInterceptor)
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
  getRecents(@GetUser() user: UserModel, @Query('limit') limit: number = 10): Promise<CommentRecent[]> {
    return this.commentsManager.getRecents(user, limit)
  }
}
