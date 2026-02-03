import { FastifyRequest } from 'fastify'
import { UserModel } from '../../applications/users/models/user.model'

export interface FastifyAuthenticatedRequest extends FastifyRequest {
  user: UserModel
}
