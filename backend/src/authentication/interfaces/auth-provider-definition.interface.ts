import type { Type } from '@nestjs/common'
import type { AuthProvider } from '../providers/auth-providers.models.js'

export interface AuthProviderDefinition {
  provider: Type<AuthProvider>
  controllers: Type[]
}
