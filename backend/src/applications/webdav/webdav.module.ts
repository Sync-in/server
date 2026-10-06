import { Module } from '@nestjs/common'
import { WebDAVProtocolGuard } from './guards/webdav-protocol.guard.js'
import { WebDAVMethods } from './services/webdav-methods.service.js'
import { WebDAVSpaces } from './services/webdav-spaces.service.js'
import { WebDAVController } from './webdav.controller.js'

@Module({
  controllers: [WebDAVController],
  providers: [WebDAVProtocolGuard, WebDAVMethods, WebDAVSpaces]
})
export class WebDAVModule {}
