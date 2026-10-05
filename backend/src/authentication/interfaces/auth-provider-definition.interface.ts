import type { Type } from '@nestjs/common'
import type { AuthProvider } from '../providers/auth-providers.models'

export interface AuthProviderDefinition {
  provider: Type<AuthProvider>
  controllers: Type[]
}
