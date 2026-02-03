import { HttpException, HttpStatus, Injectable, Logger, StreamableFile } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { AuthManager } from '../../../authentication/auth.service'
import { LoginResponseDto } from '../../../authentication/dto/login-response.dto'
import { JwtIdentityPayload } from '../../../authentication/interfaces/jwt-payload.interface'
import { serverConfig } from '../../../configuration/config.environment'
import { FilesManager } from '../../files/services/files-manager.service'
import { SendFile } from '../../files/utils/send-file'
import { SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { UserPasswordDto } from '../../users/dto/user-properties.dto'
import { UserModel } from '../../users/models/user.model'
import { UsersManager } from '../../users/services/users-manager.service'
import { getAvatarBase64 } from '../../users/utils/avatar'
import { LINK_ERROR } from '../constants/links'
import { LinkAsUser } from '../interfaces/link-guest.interface'
import { SpaceLink } from '../interfaces/link-space.interface'
import { LinksQueries } from './links-queries.service'

@Injectable()
export class LinksManager {
  private logger = new Logger(LinksManager.name)

  constructor(
    private readonly authManager: AuthManager,
    private readonly usersManager: UsersManager,
    private readonly filesManager: FilesManager,
    private readonly spacesManager: SpacesManager,
    private readonly linksQueries: LinksQueries
  ) {}

  async linkValidation(identity: JwtIdentityPayload, uuid: string): Promise<{ ok: boolean; error: string | true; link: SpaceLink }> {
    const [_link, check, ok] = await this.linkEnv(identity, uuid)
    if (!ok) {
      this.logger.warn(`${this.linkValidation.name} - ${uuid} : ${check}`)
    }
    const spaceLink: SpaceLink = ok ? await this.linksQueries.spaceLink(uuid) : null
    if (ok) {
      if (spaceLink?.owner?.login) {
        spaceLink.owner.avatar = await getAvatarBase64(spaceLink.owner.login)
        // For security reasons
        delete spaceLink.owner.login
      }
      if (spaceLink?.share) {
        // Only used when the link is a file or a directory
        spaceLink.fileEditors = serverConfig.fileEditors
      }
    }
    return { ok: ok, error: ok ? null : check, link: spaceLink }
  }

  async linkAccess(
    identity: JwtIdentityPayload,
    uuid: string,
    req: FastifyRequest,
    res: FastifyReply
  ): Promise<LoginResponseDto | Omit<LoginResponseDto, 'token'>> {
    const [link, check, ok] = await this.linkEnv(identity, uuid)
    if (!ok) {
      this.logger.warn(`${this.linkAccess.name} - *${link.user.login}* (${link.user.id}) : ${check}`)
      throw new HttpException(check as string, HttpStatus.BAD_REQUEST)
    }
    const user = new UserModel(link.user)
    if (link.user.id !== identity.id) {
      // Authenticate user to allow access to the directory
      this.logger.log(`${this.linkAccess.name} - *${user.login}* (${user.id}) is logged`)
      this.incrementLinkNbAccess(link)
      this.usersManager.updateAccesses(user, req.ip, true).catch((e: Error) => this.logger.error(`${this.linkAccess.name} - ${e}`))
      return this.authManager.setCookies(user, res)
    }
    // Already authenticated
    return { user: user, server: serverConfig }
  }

  async linkDownload(identity: JwtIdentityPayload, uuid: string, req: FastifyRequest, res: FastifyReply): Promise<StreamableFile> {
    const [link, check, ok] = await this.linkEnv(identity, uuid)
    if (!ok) {
      this.logger.warn(`${this.linkDownload.name} - *${link.user.login}* (${link.user.id}) : ${check}`)
      throw new HttpException(check as string, HttpStatus.BAD_REQUEST)
    }
    const spaceLink: SpaceLink = await this.linksQueries.spaceLink(uuid)
    if (spaceLink.space || spaceLink.share?.isDir) {
      this.logger.error(`${this.linkDownload.name} - the provided link does not reference a downloadable file`)
      throw new HttpException('This link does not allow file download', HttpStatus.BAD_REQUEST)
    }
    const user = new UserModel(link.user)
    // Download the file (authentication has been verified before)
    this.logger.log(`${this.linkDownload.name} - *${user.login}* (${user.id}) downloading ${spaceLink.share.name}`)
    this.incrementLinkNbAccess(link)
    const spaceEnv: SpaceEnv = await this.spaceEnvFromLink(user, spaceLink)
    const sendFile: SendFile = this.filesManager.sendFileFromSpace(spaceEnv, spaceLink.share.name)
    try {
      await sendFile.checks()
      return await sendFile.stream(req, res)
    } catch (e) {
      this.logger.error(`${this.linkDownload.name} - unable to send file : ${e}`)
      throw new HttpException('Unable to download file', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async linkAuthentication(identity: JwtIdentityPayload, uuid: string, linkPasswordDto: UserPasswordDto, req: FastifyRequest, res: FastifyReply) {
    const [link, check, ok] = await this.linkEnv(identity, uuid, true)
    if (!ok) {
      this.logger.warn(`${this.linkAuthentication.name} - *${link.user.login}* (${link.user.id}) : ${check}`)
      throw new HttpException(check as string, HttpStatus.BAD_REQUEST)
    }
    const authSuccess: boolean = await this.usersManager.compareUserPassword(link.user.id, linkPasswordDto.password)
    const user = new UserModel(link.user)
    this.usersManager.updateAccesses(user, req.ip, authSuccess).catch((e: Error) => this.logger.error(`${this.linkAuthentication.name} - ${e}`))
    if (!authSuccess) {
      this.logger.warn(`${this.linkAuthentication.name} - *${user.login}* (${user.id}) : auth failed`)
      throw new HttpException(LINK_ERROR.UNAUTHORIZED, HttpStatus.FORBIDDEN)
    }
    // authenticate user to allow access
    this.logger.log(`${this.linkAuthentication.name} - *${user.login}* (${user.id}) is logged`)
    return this.authManager.setCookies(user, res)
  }

  private spaceEnvFromLink(user: UserModel, link: SpaceLink): Promise<SpaceEnv> {
    return this.spacesManager.spaceEnv(user, [
      link.space ? SPACE_REPOSITORY.FILES : SPACE_REPOSITORY.SHARES,
      link.space ? link.space.alias : link.share.alias
    ])
  }

  private async linkEnv(identity: JwtIdentityPayload, uuid: string, ignoreAuth: boolean = false): Promise<[LinkAsUser, string | true, boolean]> {
    const link: LinkAsUser = await this.linksQueries.linkFromUUID(uuid)
    const check: string | true = this.checkLink(identity, link, ignoreAuth)
    const ok: boolean = check === true
    return [link, check, ok]
  }

  private checkLink(identity: JwtIdentityPayload, link: LinkAsUser, ignoreAuth: boolean = false): string | true {
    if (!link) {
      return LINK_ERROR.NOT_FOUND
    }
    if (!link.user.isActive) {
      return LINK_ERROR.DISABLED
    }
    if (link.limitAccess !== 0 && link.nbAccess >= link.limitAccess) {
      return LINK_ERROR.EXCEEDED
    }
    if (link.expiresAt && new Date() >= link.expiresAt) {
      return LINK_ERROR.EXPIRED
    }
    if (!ignoreAuth && link.requireAuth && link.user.id !== identity.id) {
      return LINK_ERROR.UNAUTHORIZED
    }
    return true
  }

  private incrementLinkNbAccess(link: LinkAsUser) {
    this.linksQueries.incrementLinkNbAccess(link.uuid).catch((e: Error) => this.logger.error(`${this.incrementLinkNbAccess.name} - ${e}`))
  }
}
