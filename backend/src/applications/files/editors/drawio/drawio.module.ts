import { Module } from '@nestjs/common'
import { DrawioManager } from './drawio-manager.service'
import { DrawioController } from './drawio.controller'

@Module({
  controllers: [DrawioController],
  providers: [DrawioManager]
})
export class DrawioModule {}
