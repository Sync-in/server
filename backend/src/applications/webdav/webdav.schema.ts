import { z } from 'zod'
import { WEBDAV_NS } from './constants/routes.js'

export const repositoryParameterSchema = z.enum([WEBDAV_NS.SPACES, WEBDAV_NS.TRASH])
