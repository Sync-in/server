import { Socket } from 'socket.io'
import { JwtIdentityPayload } from '../../../authentication/interfaces/jwt-payload.interface'

export type AuthenticatedSocketIO = Socket & { user: JwtIdentityPayload }
