import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { getProps, isPathExists, isPathIsDir } from '../../files/utils/files'
import { SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesBrowser } from '../../spaces/services/spaces-browser.service'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { canAccessToSpaceUrl } from '../../spaces/utils/permissions'
import { UserModel } from '../../users/models/user.model'
import { WEBDAV_NS, WEBDAV_SPACES } from '../constants/routes'
import { DEPTH } from '../constants/webdav'
import { FastifyDAVRequest } from '../interfaces/webdav.interface'
import { WebDAVFile } from '../models/webdav-file.model'
import { WEBDAV_PATH_TO_SPACE_SEGMENTS } from '../utils/routes'

@Injectable()
export class WebDAVSpaces {
  private readonly logger = new Logger(WebDAVSpaces.name)
  private readonly roots: Record<string, WebDAVFile> = {}

  constructor(
    private readonly spacesManager: SpacesManager,
    private readonly spacesBrowser: SpacesBrowser
  ) {
    for (const [name, info] of Object.entries(WEBDAV_SPACES)) {
      this.roots[name] = new WebDAVFile(
        {
          id: 0,
          name: name,
          isDir: true,
          size: 0,
          ctime: new Date().getTime(),
          mtime: new Date().getTime(),
          mime: undefined
        },
        info.route,
        true
      )
    }
  }

  async spaceEnv(user: UserModel, path: string) {
    try {
      const space: SpaceEnv = await this.spacesManager.spaceEnv(user, WEBDAV_PATH_TO_SPACE_SEGMENTS(path))
      if (space) {
        return space
      }
    } catch (e) {
      this.logger.warn({ tag: this.spaceEnv.name, msg: `${e}` })
      return null
    }

    this.logger.warn({ tag: this.spaceEnv.name, msg: `Space not authorized or not found : ${path}` })
    return null
  }

  propfind(req: FastifyDAVRequest, space: string): AsyncGenerator<WebDAVFile> {
    switch (space) {
      case SPACE_REPOSITORY.FILES:
        return this.listFiles(req, req.space)
      case WEBDAV_NS.SERVER:
        return this.listServer(req)
      case WEBDAV_NS.WEBDAV:
        return this.listWebDAV(req)
      case WEBDAV_NS.SPACES:
        return this.listSpaces(req)
      case WEBDAV_NS.TRASH:
        return this.listTrashes(req)
      default:
        this.logger.error({ tag: this.propfind.name, msg: `Unknown space ${space}` })
        throw new HttpException('Unknown space', HttpStatus.NOT_FOUND)
    }
  }

  private async *listServer(req: FastifyDAVRequest): AsyncGenerator<WebDAVFile> {
    yield this.roots[WEBDAV_NS.SERVER]

    if (req.dav.depth === DEPTH.MEMBERS) {
      yield this.roots[WEBDAV_NS.WEBDAV]
    }
  }

  private async *listWebDAV(req: FastifyDAVRequest): AsyncGenerator<WebDAVFile> {
    yield this.roots[WEBDAV_NS.WEBDAV]

    if (req.dav.depth === DEPTH.MEMBERS) {
      for (const root of Object.values(this.roots)) {
        if ([WEBDAV_NS.SERVER as string, WEBDAV_NS.WEBDAV as string].indexOf(root.name) === -1) {
          // filter repositories based on user applications
          if (!canAccessToSpaceUrl(req.user, WEBDAV_SPACES[root.name].spaceRepository)) {
            continue
          }
          yield root
        }
      }
    }
  }

  private async *listSpaces(req: FastifyDAVRequest): AsyncGenerator<WebDAVFile> {
    yield this.roots[WEBDAV_NS.SPACES]

    if (req.dav.depth === DEPTH.MEMBERS) {
      for (const s of await this.spacesManager.listSpaces(req.user.id)) {
        yield new WebDAVFile(
          {
            id: s.id,
            name: s.name,
            alias: s.alias,
            isDir: true,
            size: 0,
            mime: undefined,
            ctime: new Date(s.createdAt).getTime(),
            mtime: new Date(s.modifiedAt).getTime()
          },
          req.dav.url
        )
      }
    }
  }

  private async *listTrashes(req: FastifyDAVRequest): AsyncGenerator<WebDAVFile> {
    yield this.roots[WEBDAV_NS.TRASH]

    if (req.dav.depth === DEPTH.MEMBERS) {
      for (const f of await this.spacesManager.listTrashes(req.user)) {
        yield new WebDAVFile(
          {
            id: f.id,
            alias: f.alias,
            name: `${f.alias} (${f.nb})`,
            isDir: true,
            size: 0,
            mime: undefined,
            mtime: f.mtime,
            ctime: f.ctime
          },
          req.dav.url
        )
      }
    }
  }

  private async *listFiles(req: FastifyDAVRequest, space: SpaceEnv): AsyncGenerator<WebDAVFile> {
    let isDir: boolean

    if (space.inSharesList) {
      // The shares are defined like a files (direct link)
      isDir = true
      yield this.roots[WEBDAV_NS.SHARES]
    } else {
      if (!(await isPathExists(space.realPath))) {
        this.logger.warn({ tag: this.listFiles.name, msg: `Location not found : ${space.realPath}` })
        throw new HttpException('Location not found', HttpStatus.NOT_FOUND)
      }
      yield new WebDAVFile(await getProps(space.realPath, req.dav.url), req.dav.url, true)
    }

    if (req.dav.depth === DEPTH.MEMBERS && (isDir === true || (await isPathIsDir(space.realPath)))) {
      const { files } = await this.spacesBrowser.browse(req.user, space)
      for (const f of files) {
        yield new WebDAVFile(f, req.dav.url)
      }
    }
  }
}
