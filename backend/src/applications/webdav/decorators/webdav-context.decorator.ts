import { applyDecorators, SetMetadata, UseFilters, UseGuards } from '@nestjs/common'
import { AuthBasicGuard } from '../../../authentication/guards/auth-basic.guard'
import { WebDAVExceptionsFilter } from '../filters/webdav.filter'
import { WebDAVProtocolGuard } from '../guards/webdav-protocol.guard'

export const WEB_DAV_CONTEXT = 'WebDAVContext'
export const WebDAVContext = () => SetMetadata(WEB_DAV_CONTEXT, true)
export const WebDAVEnvironment = () => {
  return applyDecorators(WebDAVContext(), UseGuards(AuthBasicGuard, WebDAVProtocolGuard), UseFilters(WebDAVExceptionsFilter))
}
