import { Module } from '@nestjs/common'
import { OnlyOfficeManager } from './only-office-manager.service'
import { OnlyOfficeController } from './only-office.controller'
import { OnlyOfficeGuard } from './only-office.guard'
import { OnlyOfficeStrategy } from './only-office.strategy'

@Module({
  controllers: [OnlyOfficeController],
  providers: [OnlyOfficeManager, OnlyOfficeGuard, OnlyOfficeStrategy]
})
export class OnlyOfficeModule {}
