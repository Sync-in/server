import { Module } from '@nestjs/common'
import { OnlyOfficeManager } from './only-office-manager.service.js'
import { OnlyOfficeController } from './only-office.controller.js'
import { OnlyOfficeGuard } from './only-office.guard.js'
import { OnlyOfficeStrategy } from './only-office.strategy.js'

@Module({
  controllers: [OnlyOfficeController],
  providers: [OnlyOfficeManager, OnlyOfficeGuard, OnlyOfficeStrategy]
})
export class OnlyOfficeModule {}
