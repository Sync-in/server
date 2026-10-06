import type { LoginResponseDto } from '../../../authentication/dto/login-response.dto.js'
import type { TokenResponseDto } from '../../../authentication/dto/token-response.dto.js'

// send the new client token
export type SyncClientAuthCookie = LoginResponseDto & { client_token_update?: string }
export type SyncClientAuthToken = TokenResponseDto & { client_token_update?: string }

export interface SyncClientAuthRegistration {
  clientId: string
  clientToken: string
}
export type SyncClientAuthenticatedRegistration = Pick<SyncClientAuthRegistration, 'clientId'>
