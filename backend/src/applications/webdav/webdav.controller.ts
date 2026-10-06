import { All, Controller, HttpStatus, Options, Param, Propfind, Req, Res, StreamableFile, UseGuards } from '@nestjs/common'
import { type FastifyReply } from 'fastify'
import { HTTP_METHOD } from '../applications.constants.js'
import { SPACE_REPOSITORY } from '../spaces/constants/spaces.js'
import { SpaceGuard } from '../spaces/guards/space.guard.js'
import { WEBDAV_BASE_PATH, WEBDAV_NS } from './constants/routes.js'
import { WebDAVEnvironment } from './decorators/webdav-context.decorator.js'
import { type FastifyDAVRequest } from './interfaces/webdav.interface.js'
import { WebDAVMethods } from './services/webdav-methods.service.js'

@Controller()
@WebDAVEnvironment()
export class WebDAVController {
  constructor(private readonly webdavMethods: WebDAVMethods) {}

  @Options()
  serverOptions(): void {
    // OPTIONS method is handled in the `WebDAVProtocolGuard`, return empty response with headers
    return
  }

  @Propfind()
  serverPropFind(@Req() req: FastifyDAVRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<string> {
    return this.webdavMethods.propfind(req, res, WEBDAV_NS.SERVER)
  }

  @Options(WEBDAV_BASE_PATH)
  webdavOptions(): void {
    // OPTIONS method is handled in the `WebDAVProtocolGuard`, return empty response with headers
    return
  }

  @Propfind(WEBDAV_BASE_PATH)
  async webdavPropfind(@Req() req: FastifyDAVRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<string> {
    return this.webdavMethods.propfind(req, res, WEBDAV_NS.WEBDAV)
  }

  @Options(`${WEBDAV_BASE_PATH}/:repository(^(${WEBDAV_NS.SPACES}|${WEBDAV_NS.TRASH})$)`)
  repositoriesOptions(): void {
    // OPTIONS method is handled in the `WebDAVProtocolGuard`
    return
  }

  @Propfind(`${WEBDAV_BASE_PATH}/:repository(^(${WEBDAV_NS.SPACES}|${WEBDAV_NS.TRASH})$)`)
  async repositoriesPropfind(
    @Req() req: FastifyDAVRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @Param('repository') repository: string
  ): Promise<string> {
    return this.webdavMethods.propfind(req, res, repository)
  }

  @All(`${WEBDAV_BASE_PATH}/*`)
  @UseGuards(SpaceGuard)
  async files(@Req() req: FastifyDAVRequest, @Res({ passthrough: true }) res: FastifyReply): Promise<string | StreamableFile> {
    // OPTIONS method is handled in the `WebDAVProtocolGuard`
    switch (req.method) {
      case HTTP_METHOD.PROPFIND:
        return this.webdavMethods.propfind(req, res, SPACE_REPOSITORY.FILES)
      case HTTP_METHOD.HEAD:
      case HTTP_METHOD.GET:
        return this.webdavMethods.headOrGet(req, res, SPACE_REPOSITORY.FILES)
      case HTTP_METHOD.PUT:
        return this.webdavMethods.put(req, res)
      case HTTP_METHOD.DELETE:
        return this.webdavMethods.delete(req, res)
      case HTTP_METHOD.LOCK:
        return this.webdavMethods.lock(req, res)
      case HTTP_METHOD.UNLOCK:
        return this.webdavMethods.unlock(req, res)
      case HTTP_METHOD.PROPPATCH:
        return this.webdavMethods.proppatch(req, res)
      case HTTP_METHOD.MKCOL:
        return this.webdavMethods.mkcol(req, res)
      case HTTP_METHOD.COPY:
      case HTTP_METHOD.MOVE:
        return this.webdavMethods.copyMove(req, res)
      default:
        return res.status(HttpStatus.METHOD_NOT_ALLOWED).send()
    }
  }
}
