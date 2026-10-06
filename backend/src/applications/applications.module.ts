import { Global, Module } from '@nestjs/common'
import { AdminModule } from './admin/admin.module.js'
import { CommentsModule } from './comments/comments.module.js'
import { FilesModule } from './files/files.module.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { SharesModule } from './shares/shares.module.js'
import { SpacesModule } from './spaces/spaces.module.js'
import { SyncModule } from './sync/sync.module.js'
import { UsersModule } from './users/users.module.js'
import { WebDAVModule } from './webdav/webdav.module.js'

@Global()
@Module({
  imports: [UsersModule, SpacesModule, SharesModule, FilesModule, WebDAVModule, AdminModule, CommentsModule, NotificationsModule, SyncModule],
  exports: [UsersModule, SpacesModule, SharesModule, FilesModule, WebDAVModule, CommentsModule, NotificationsModule]
})
export class ApplicationsModule {}
