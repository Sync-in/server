import { Module } from '@nestjs/common'
import { DrawioManager } from './drawio-manager.service.js'
import { DrawioController } from './drawio.controller.js'

@Module({
  controllers: [DrawioController],
  providers: [DrawioManager]
})
export class DrawioModule {}
