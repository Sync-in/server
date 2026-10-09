import { Socket } from 'socket.io'
import type { JwtIdentityPayload } from '../../../authentication/interfaces/jwt-payload.interface.js'

export type AuthenticatedSocketIO = Socket & { user: JwtIdentityPayload }
