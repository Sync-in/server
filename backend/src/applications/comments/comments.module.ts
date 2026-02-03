import { Module } from '@nestjs/common'
import { CommentsController } from './comments.controller'
import { CommentsManager } from './services/comments-manager.service'
import { CommentsQueries } from './services/comments-queries.service'

@Module({
  controllers: [CommentsController],
  providers: [CommentsManager, CommentsQueries]
})
export class CommentsModule {}
