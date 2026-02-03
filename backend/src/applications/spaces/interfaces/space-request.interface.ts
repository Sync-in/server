import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'
import { SpaceEnv } from '../models/space-env.model'

export interface FastifySpaceRequest extends FastifyAuthenticatedRequest {
  space: SpaceEnv
}
