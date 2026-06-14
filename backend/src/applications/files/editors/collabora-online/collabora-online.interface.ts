import type { JwtIdentityPayload, JwtPayloadBase } from '../../../../authentication/interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from '../../../../authentication/interfaces/token.interface'
import type { FastifySpaceRequest } from '../../../spaces/interfaces/space-request.interface'

export interface JwtIdentityCollaboraOnlinePayload extends JwtIdentityPayload {
  spaceUrl: string
  dbFileHash: string
}

export interface JwtPayloadCollaboraOnline extends JwtPayloadBase {
  identity: JwtIdentityCollaboraOnlinePayload
  tokenType: TOKEN_TYPE.COLLABORA_ONLINE
}

export interface FastifyCollaboraOnlineSpaceRequest extends FastifySpaceRequest {
  user: FastifySpaceRequest['user'] & { spaceUrl?: string; dbFileHash?: string }
  params: FastifySpaceRequest['params'] & { dbFileHash?: string }
}

export interface CollaboraOnlineCheckFileInfo {
  BaseFileName: string
  OwnerId: string
  UserId: string
  UserFriendlyName: string
  Version: string
  Size: number
  LastModifiedTime: string
  ReadOnly: false
  UserExtraInfo: { avatar: string }
  UserCanNotWriteRelative: true
  UserCanWrite: boolean
  UserCanRename: false
  SupportsRename: false
  SupportsUpdate: true
  SupportsExport: boolean
  SupportsCoauth: true
  SupportsLocks: true
  SupportsGetLock: true
}
