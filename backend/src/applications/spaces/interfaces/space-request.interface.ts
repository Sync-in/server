import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface.js'
import { SpaceEnv } from '../models/space-env.model.js'

export interface FastifySpaceRequest extends FastifyAuthenticatedRequest {
  space: SpaceEnv
}
