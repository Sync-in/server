import { HttpException, HttpStatus, Injectable, Logger, StreamableFile } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { currentTimeStamp, encodeUrl } from '../../../common/shared'
import { FileLock, FileLockOptions } from '../../files/interfaces/file-lock.interface'
import { FileError } from '../../files/models/file-error'
import { LockConflict } from '../../files/models/file-lock-error'
import { FilesLockManager } from '../../files/services/files-lock-manager.service'
import { FilesManager } from '../../files/services/files-manager.service'
import { dirName, fileName, genEtag, isPathExists, isPathIsDir } from '../../files/utils/files'
import { SPACE_OPERATION, SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { dbFileFromSpace } from '../../spaces/utils/paths'
import { haveSpaceEnvPermissions } from '../../spaces/utils/permissions'
import {
  DEPTH,
  HEADER,
  LOCK_DISCOVERY_PROP,
  NS_PREFIX,
  OPTIONS_HEADERS,
  PRECONDITION,
  PROPPATCH_METHOD,
  PROPPATCH_MODIFIED_PROPS,
  PROPPATCH_PROP_UPDATE,
  PROPPATCH_SUPPORTED_PROPS,
  PROPSTAT,
  STANDARD_PROPS,
  WEBDAV_APP_LOCK,
  XML_CONTENT_TYPE
} from '../constants/webdav'
import { IfHeaderDecorator } from '../decorators/if-header.decorator'
import { FastifyDAVRequest } from '../interfaces/webdav.interface'
import { extractAllTokens, extractOneToken } from '../utils/if-header'
import { DAV_ERROR_RES, LOCK_DISCOVERY, LOCK_PROP, MULTI_STATUS, PROP, PROP_STAT } from '../utils/webdav'
import { xmlBuild } from '../utils/xml'
import { WebDAVSpaces } from './webdav-spaces.service'

@Injectable()
export class WebDAVMethods {
  private readonly logger = new Logger(WebDAVMethods.name)

  constructor(
    private readonly webDAVHandler: WebDAVSpaces,
    private readonly filesManager: FilesManager,
    private readonly filesLockManager: FilesLockManager
  ) {}

  async headOrGet(req: FastifyDAVRequest, res: FastifyReply, repository: string): Promise<StreamableFile> {
    if (repository === SPACE_REPOSITORY.FILES && !req.space.inSharesList) {
      if ((await isPathExists(req.space.realPath)) && (await isPathIsDir(req.space.realPath))) {
        // Directory case
        return res
          .header('DAV', OPTIONS_HEADERS.DAV)
          .header('Content-Type', 'httpd/unix-directory')
          .header('Content-Length', '0')
          .status(HttpStatus.OK)
          .send()
      }
      const sendFile = this.filesManager.sendFileFromSpace(req.space)
      try {
        await sendFile.checks()
        return await sendFile.stream(req, res)
      } catch (e) {
        return this.handleError(req, res, e)
      }
    }
    this.logger.warn(`Not allowed on this resource : ${repository}`)
    return res.status(HttpStatus.FORBIDDEN).send('Not allowed on this resource')
  }

  @IfHeaderDecorator()
  async lock(req: FastifyDAVRequest, res: FastifyReply) {
    const isLockRefresh = !req.dav.body
    const rExists = await isPathExists(req.space.realPath)

    if (isLockRefresh) {
      // if the body has no content, the request must refresh the lock
      if (!rExists) {
        this.logger.warn('Lock refresh must specify an existing resource')
        return res.status(HttpStatus.BAD_REQUEST).send('Lock refresh must specify an existing resource')
      }
      return this.lockRefresh(req, res, req.space.dbFile.path)
    }
    if (!rExists) {
      if (!haveSpaceEnvPermissions(req.space, SPACE_OPERATION.ADD)) {
        this.logger.warn(`is not allowed to create on this space : *${req.space.alias}* (${req.space.id}) : ${req.space.url}`)
        return res.status(HttpStatus.FORBIDDEN).send('You are not allowed to do this action')
      }
      if (!(await isPathExists(dirName(req.space.realPath)))) {
        return res.status(HttpStatus.CONFLICT).send('Parent must exists')
      }
    }

    const lockOptions: FileLockOptions = {
      lockRoot: req.dav.url,
      lockToken: this.filesLockManager.genDAVToken(),
      lockScope: req.dav.lock.lockscope,
      lockInfo: req.dav.lock?.owner
    }

    const [ok, fileLock] = await this.filesLockManager.create(
      req.user,
      req.space.dbFile,
      WEBDAV_APP_LOCK,
      req.dav.depth,
      lockOptions,
      req.dav.lock.timeout
    )
    if (ok) {
      // Locking unmapped URLs: must create an empty resource (that is not a collection)
      if (!rExists) {
        // checkLocks set to false because the conflicts are already checked in the `filesLockManager.create` method
        await this.filesManager.mkFile(req.user, req.space, false, false, false)
      }
      const lockProp = LOCK_PROP([fileLock])
      return res
        .header(HEADER.LOCK_TOKEN, `<${lockOptions.lockToken}>`)
        .type(XML_CONTENT_TYPE)
        .status(rExists ? HttpStatus.OK : HttpStatus.CREATED)
        .send(xmlBuild(lockProp))
    }
    if (fileLock) {
      const lockProp = LOCK_PROP([fileLock])
      return res.type(XML_CONTENT_TYPE).status(HttpStatus.LOCKED).send(xmlBuild(lockProp))
    }
    return DAV_ERROR_RES(HttpStatus.LOCKED, PRECONDITION.LOCK_CONFLICT, res, fileLock.options?.lockRoot || fileLock.dbFilePath)
  }

  @IfHeaderDecorator()
  async unlock(req: FastifyDAVRequest, res: FastifyReply) {
    if (!(await isPathExists(req.space.realPath))) {
      this.logger.warn(`Unable to unlock: ${req.dav.url} - resource does not exist`)
      return res.status(HttpStatus.NOT_FOUND).send(req.dav.url)
    }

    const lock = await this.filesLockManager.isLockedWithToken(req.dav.lock.token, req.space.dbFile.path)
    if (!lock) {
      this.logger.warn(`Lock token does not exist or not match URL : ${req.dav.lock.token}`)
      return DAV_ERROR_RES(HttpStatus.CONFLICT, PRECONDITION.LOCK_TOKEN_MISMATCH, res)
    }
    if (req.user.id !== lock.owner.id) {
      return res.status(HttpStatus.FORBIDDEN).send('Token was created by another user')
    }

    await this.filesLockManager.removeLock(lock.key)
    return res.status(HttpStatus.NO_CONTENT).send()
  }

  @IfHeaderDecorator()
  async propfind(req: FastifyDAVRequest, res: FastifyReply, repository: string): Promise<string> {
    if (repository === SPACE_REPOSITORY.FILES && !req.space.inSharesList) {
      if (!(await isPathExists(req.space.realPath))) {
        return res.status(HttpStatus.NOT_FOUND).send(req.dav.url)
      }
    }

    const responses: any[] = []
    let requestedProps: string[]
    let locks: Record<string, FileLock> = {}

    if (req.dav.propfindMode === PROPSTAT.PROP) {
      // ignores all unknown properties (non-RFC compliant but avoids generating too much content, faster)
      requestedProps = Object.keys(req.dav.body.propfind.prop).filter((prop: string) => STANDARD_PROPS.indexOf(prop) > -1)
    } else {
      requestedProps = STANDARD_PROPS
    }

    // Searches all child locks (only for real files) & ignores /webdav/shares endpoint (special case)
    if (req.dav.propfindMode !== PROPSTAT.PROPNAME && repository === SPACE_REPOSITORY.FILES && !req.space.inSharesList) {
      if (req.dav.depth === DEPTH.RESOURCE) {
        // match depth '0'
        locks = await this.filesLockManager.browseLocks(req.space.dbFile)
      } else {
        // match depth '1' or 'infinity'
        locks = await this.filesLockManager.browseParentChildLocks(req.space.dbFile)
      }
    }

    for await (const f of this.webDAVHandler.propfind(req, repository)) {
      let prop: any
      if (req.dav.propfindMode === PROPSTAT.PROPNAME) {
        prop = { ...Object.fromEntries(requestedProps.map((x) => [`${NS_PREFIX}:${x}`, ''])) }
      } else {
        prop = {}
        for (const p of requestedProps) {
          let fP: any
          if (p === LOCK_DISCOVERY_PROP) {
            let lockDiscovery: any[] = null
            if (repository === SPACE_REPOSITORY.FILES) {
              if (f.name in locks) {
                lockDiscovery = LOCK_DISCOVERY([locks[f.name]])
              } else {
                // The lock name may correspond to the original file at the space root.
                const fName = fileName(req.space.dbFile.path)
                if (fName in locks) {
                  lockDiscovery = LOCK_DISCOVERY([locks[fName]])
                }
              }
            }
            fP = lockDiscovery
          } else {
            fP = f[p]
          }
          if (fP !== undefined) prop[`${NS_PREFIX}:${p}`] = fP
        }
      }
      responses.push(PROP_STAT(f.href, PROP(prop, req.dav.httpVersion, HttpStatus.OK)))
    }
    const propfind = xmlBuild(MULTI_STATUS(responses))
    return res.type(XML_CONTENT_TYPE).status(HttpStatus.MULTI_STATUS).send(propfind)
  }

  @IfHeaderDecorator()
  async put(req: FastifyDAVRequest, res: FastifyReply): Promise<FastifyReply> {
    let rExists: boolean
    try {
      rExists = await this.filesManager.saveStream(req.user, req.space, req, {
        dav: {
          depth: req.dav.depth,
          lockTokens: extractAllTokens(req.dav.ifHeaders)
        }
      })
    } catch (e) {
      return this.handleError(req, res, e)
    }
    return res
      .header('etag', genEtag(null, req.space.realPath))
      .status(rExists ? HttpStatus.NO_CONTENT : HttpStatus.CREATED)
      .send()
  }

  @IfHeaderDecorator()
  async delete(req: FastifyDAVRequest, res: FastifyReply) {
    try {
      await this.filesManager.delete(req.user, req.space, { lockTokens: extractAllTokens(req.dav.ifHeaders) })
    } catch (e) {
      return this.handleError(req, res, e)
    }
    return res.status(HttpStatus.NO_CONTENT).send()
  }

  @IfHeaderDecorator()
  async proppatch(req: FastifyDAVRequest, res: FastifyReply) {
    /* only support 'time modifications' */
    if (!(await isPathExists(req.space.realPath))) {
      return res.status(HttpStatus.NOT_FOUND).send(req.dav.url)
    }

    // check locks
    try {
      await this.filesLockManager.checkConflicts(req.space.dbFile, req.dav.depth, {
        userId: req.user.id,
        lockTokens: extractAllTokens(req.dav.ifHeaders)
      })
    } catch (e) {
      return this.handleError(req, res, e)
    }

    // evaluate props and return multistatus if errors
    req.dav.proppatch = { props: {}, errors: [] }
    for (const action of Object.keys(req.dav.body[PROPPATCH_PROP_UPDATE])) {
      if (Object.values(PROPPATCH_METHOD).indexOf(action) === -1) {
        const msg = `Unknown tag : expected ${PROPPATCH_METHOD.SET} or ${PROPPATCH_METHOD.REMOVE}`
        this.logger.debug(msg)
        return res.status(HttpStatus.BAD_REQUEST).send(msg)
      }

      if (Array.isArray(req.dav.body[PROPPATCH_PROP_UPDATE][action])) {
        if (Object.keys(req.dav.body[PROPPATCH_PROP_UPDATE][action][0])[0] === PROPSTAT.PROP) {
          req.dav.body[PROPPATCH_PROP_UPDATE][action] = {
            [PROPSTAT.PROP]: req.dav.body[PROPPATCH_PROP_UPDATE][action].map((e: any) => e[PROPSTAT.PROP])
          }
        }
      }

      if (Object.keys(req.dav.body[PROPPATCH_PROP_UPDATE][action])[0] !== PROPSTAT.PROP) {
        const msg = `Unknown tag : expected ${PROPSTAT.PROP}`
        this.logger.debug(msg)
        return res.status(HttpStatus.BAD_REQUEST).send(msg)
      }

      if (!Array.isArray(req.dav.body[PROPPATCH_PROP_UPDATE][action][PROPSTAT.PROP])) {
        req.dav.body[PROPPATCH_PROP_UPDATE][action][PROPSTAT.PROP] = [req.dav.body[PROPPATCH_PROP_UPDATE][action][PROPSTAT.PROP]]
      }

      for (const prop of req.dav.body[PROPPATCH_PROP_UPDATE][action][PROPSTAT.PROP] as Record<string, string>[]) {
        for (let [name, value] of Object.entries(prop)) {
          if (action === PROPPATCH_METHOD.REMOVE) {
            value = null
            this.logger.debug(`Proppatch remove method not handled : ${name} -> ${value}`)
          }
          if (PROPPATCH_SUPPORTED_PROPS.indexOf(name) === -1) {
            req.dav.proppatch.errors.push(
              PROP(
                { [`${NS_PREFIX}:${name}`]: null },
                req.dav.httpVersion,
                HttpStatus.FORBIDDEN,
                STANDARD_PROPS.indexOf(name) > -1 ? PRECONDITION.PROTECTED_PROPERTY : undefined
              )
            )
            continue
          }
          req.dav.proppatch.props[name] = value
        }
      }
    }

    if (req.dav.proppatch.errors.length) {
      // convert all passed props to failed dependency
      for (const name of Object.keys(req.dav.proppatch.props)) {
        req.dav.proppatch.errors.push(PROP({ [`${NS_PREFIX}:${name}`]: null }, req.dav.httpVersion, HttpStatus.FAILED_DEPENDENCY))
      }
      const proppatch = xmlBuild(MULTI_STATUS(PROP_STAT(encodeUrl(req.dav.url), req.dav.proppatch.errors)))
      return res.status(HttpStatus.MULTI_STATUS).type(XML_CONTENT_TYPE).send(proppatch)
    }

    // apply modifications
    let atLeastOneError = false
    const states: Record<string, boolean> = {}
    for (const [name, value] of Object.entries(req.dav.proppatch.props)) {
      if (PROPPATCH_MODIFIED_PROPS.indexOf(name) > -1) {
        try {
          await this.filesManager.touch(req.user, req.space, currentTimeStamp(new Date(value)), false)
        } catch (e) {
          this.logger.error(`${this.proppatch.name} - unable to modify mtime on ${req.dav.url} : ${e}`)
          states[name] = false
          atLeastOneError = true
        }
      }
      // hook: we let the known Win32* properties pass to return a consistent result
      states[name] = true
    }

    const props = []
    for (const [name, state] of Object.entries(states)) {
      props.push(
        PROP(
          { [`${NS_PREFIX}:${name}`]: null },
          req.dav.httpVersion,
          state ? (atLeastOneError ? HttpStatus.FAILED_DEPENDENCY : HttpStatus.OK) : HttpStatus.BAD_REQUEST
        )
      )
    }
    const proppatch = xmlBuild(MULTI_STATUS(PROP_STAT(encodeUrl(req.dav.url), props)))
    return res.type(XML_CONTENT_TYPE).status(HttpStatus.MULTI_STATUS).send(proppatch)
  }

  @IfHeaderDecorator()
  async mkcol(req: FastifyDAVRequest, res: FastifyReply) {
    try {
      await this.filesManager.mkDir(req.user, req.space, false, { depth: req.dav.depth, lockTokens: extractAllTokens(req.dav.ifHeaders) })
    } catch (e) {
      return this.handleError(req, res, e)
    }
    return res.status(HttpStatus.CREATED).send()
  }

  @IfHeaderDecorator()
  async copyMove(req: FastifyDAVRequest, res: FastifyReply) {
    const dstSpace: SpaceEnv = await this.webDAVHandler.spaceEnv(req.user, req.dav.copyMove.destination)
    if (!dstSpace) {
      this.logger.warn(`Space not found for destination : ${req.dav.copyMove.destination}`)
      return res.status(HttpStatus.NOT_FOUND).send(req.dav.copyMove.destination)
    }
    const dstExisted = await isPathExists(dstSpace.realPath)
    // We must evaluate the if-headers on the destination
    const fakeDstReq = {
      dav: { ...req.dav, url: req.dav.copyMove.destination },
      user: req.user,
      space: dstSpace
    } as FastifyDAVRequest
    if (!(await this.evaluateIfHeaders(fakeDstReq, res))) {
      // if there is an error, the response is generated inside the `evaluateIfHeaders` function
      return
    }
    try {
      await this.filesManager.copyMove(req.user, req.space, dstSpace, req.dav.copyMove.isMove, req.dav.copyMove.overwrite, false, {
        depth: req.dav.depth,
        lockTokens: extractAllTokens(req.dav.ifHeaders)
      })
    } catch (e) {
      return this.handleError(req, res, e, dstSpace.url)
    }
    return res.status(dstExisted ? HttpStatus.NO_CONTENT : HttpStatus.CREATED).send()
  }

  protected async evaluateIfHeaders(req: FastifyDAVRequest, res: FastifyReply): Promise<boolean> {
    if (!req.dav.ifHeaders) return true
    const errors: string[] = []
    let lastPath = null
    let lastSpaceEnv: SpaceEnv
    let lastRPath = undefined
    let lastEtag = undefined // for now, we only generate one etag type (weak)
    let atLeastOneOk = false

    for (const condition of req.dav.ifHeaders) {
      if (condition.path) {
        if (condition.path !== lastPath) {
          lastPath = condition.path
          lastSpaceEnv = await this.webDAVHandler.spaceEnv(req.user, lastPath)
        }
        // the path will be the same across conditions
        if (!lastSpaceEnv) {
          this.logger.warn(`If Header : path mismatch (${condition.path})`)
          return false
        }
      } else {
        lastPath = req.dav.url
        lastSpaceEnv = req.space
      }

      if (condition.haveLock) {
        try {
          const dbFile = dbFileFromSpace(req.user.id, lastSpaceEnv)
          const match = !!(await this.filesLockManager.getLocksByPath(dbFile)).length
          if (condition.haveLock.mustMatch !== match) {
            errors.push(`have lock condition mismatch (${condition.haveLock.mustMatch} != ${match})`)
            continue
          }
        } catch (e) {
          errors.push(`have lock condition mismatch : ${e.message}`)
          continue
        }
      }

      if (condition.token) {
        const token = await this.filesLockManager.getLockByToken(condition.token.value)
        const match = token && lastPath.startsWith(token.options?.lockRoot)
        if (condition.token.mustMatch !== match) {
          if (!token) {
            errors.push(`lock token not found`)
          } else {
            errors.push(`lock token url mismatch (${lastPath} is not a child of ${token.options?.lockRoot})`)
          }
          continue
        }
      }

      if (condition.etag) {
        if (lastEtag === undefined) {
          if (lastRPath === undefined) {
            lastRPath = (await isPathExists(req.space.realPath)) ? req.space.realPath : null
          }
          lastEtag = lastRPath ? genEtag(null, lastRPath) : null
        }
        const match = lastEtag === condition.etag.value
        if (condition.etag.mustMatch !== match) {
          errors.push(`etag mismatch (${condition.etag.value} != ${lastEtag})`)
          continue
        }
      }

      atLeastOneOk = true
      break
    }

    if (!atLeastOneOk) {
      this.logger.warn(`If header condition failed : ${errors.join(', ')}`)
      res.status(HttpStatus.PRECONDITION_FAILED).send('If header condition failed')
    }
    return atLeastOneOk
  }

  private async lockRefresh(req: FastifyDAVRequest, res: FastifyReply, dbFilePath: string) {
    if (req.dav?.ifHeaders?.length !== 1) {
      this.logger.warn('Expected a lock token (only one lock may be refreshed at a time)')
      return res.status(HttpStatus.BAD_REQUEST).send('Expected a lock token (only one lock may be refreshed at a time)')
    }

    let token: string
    try {
      token = extractOneToken(req.dav.ifHeaders)
    } catch (e) {
      this.logger.warn(`${this.lockRefresh.name} - unable to extract token : ${JSON.stringify(req.dav.ifHeaders)} (${e})`)
      return res.status(HttpStatus.BAD_REQUEST).send('Unable to extract token')
    }

    const lock = await this.filesLockManager.isLockedWithToken(token, dbFilePath)
    if (!lock) {
      this.logger.warn(`Lock token does not exist or not match URL : ${token}`)
      return DAV_ERROR_RES(HttpStatus.PRECONDITION_FAILED, PRECONDITION.LOCK_TOKEN_MISMATCH, res)
    }
    if (lock.owner.id !== req.user.id) {
      this.logger.warn(`Lock token does not match owner : ${lock.owner.login} != ${req.user.login}`)
      return res.status(HttpStatus.FORBIDDEN).send('Lock token does not match owner')
    }

    await this.filesLockManager.refreshLockTimeout(lock, req.dav.lock.timeout)
    const lockProp = LOCK_PROP([lock])
    return res.type(XML_CONTENT_TYPE).status(HttpStatus.OK).send(xmlBuild(lockProp))
  }

  private handleError(req: FastifyDAVRequest, res: FastifyReply, e: any, toUrl?: string) {
    this.logger.error(`Unable to ${req.method} ${req.dav.url}${toUrl ? ` -> ${toUrl}` : ''} : ${e.message}`)
    // Remove the last part to avoid exposing the path
    const errorMsg = e.message.split(',')[0]
    if (e instanceof LockConflict) {
      return DAV_ERROR_RES(HttpStatus.LOCKED, PRECONDITION.LOCK_CONFLICT, res, e.lock.options?.lockRoot || e.lock.dbFilePath)
    } else if (e instanceof FileError) {
      return res.status(e.httpCode).send(errorMsg)
    }
    throw new HttpException(errorMsg, HttpStatus.INTERNAL_SERVER_ERROR)
  }
}
