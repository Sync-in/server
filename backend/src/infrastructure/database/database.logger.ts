import { Logger } from '@nestjs/common'
import type { Logger as DrizzleLogger } from 'drizzle-orm/logger'

export class DatabaseLogger extends Logger implements DrizzleLogger {
  logQuery(message: string, params: unknown[]) {
    super.verbose(`${message} | PARAMS: [${params}]`, 'DB')
  }
}
