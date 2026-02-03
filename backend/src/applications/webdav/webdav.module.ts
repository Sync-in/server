import { Module } from '@nestjs/common'
import { WebDAVProtocolGuard } from './guards/webdav-protocol.guard'
import { WebDAVMethods } from './services/webdav-methods.service'
import { WebDAVSpaces } from './services/webdav-spaces.service'
import { WebDAVController } from './webdav.controller'

@Module({
  controllers: [WebDAVController],
  providers: [WebDAVProtocolGuard, WebDAVMethods, WebDAVSpaces]
})
export class WebDAVModule {}
