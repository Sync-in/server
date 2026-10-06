import { FastifyRequest } from 'fastify'
import { UserModel } from '../../applications/users/models/user.model.js'

export interface FastifyAuthenticatedRequest extends FastifyRequest {
  user: UserModel
}
