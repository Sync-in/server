import { Module } from '@nestjs/common'
import { CommentsController } from './comments.controller.js'
import { CommentsManager } from './services/comments-manager.service.js'
import { CommentsQueries } from './services/comments-queries.service.js'

@Module({
  controllers: [CommentsController],
  providers: [CommentsManager, CommentsQueries]
})
export class CommentsModule {}
