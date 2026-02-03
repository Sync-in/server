import type { LoginResponseDto } from '../../../authentication/dto/login-response.dto'
import type { TokenResponseDto } from '../../../authentication/dto/token-response.dto'

// send the new client token
export type SyncClientAuthCookie = LoginResponseDto & { client_token_update?: string }
export type SyncClientAuthToken = TokenResponseDto & { client_token_update?: string }

export interface SyncClientAuthRegistration {
  clientId: string
  clientToken: string
}
