import type { UserModel } from '../../applications/users/models/user.model'
import type { AUTH_SCOPE } from '../constants/scope'

export abstract class AuthProvider {
  abstract validateUser(loginOrEmail: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel>
}
