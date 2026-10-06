import { Module } from '@nestjs/common'
import { AdminSchedulerService } from './services/admin-scheduler.service.js'
import { AdminService } from './services/admin.service.js'

@Module({
  controllers: [],
  providers: [AdminService, AdminSchedulerService]
})
export class AdminModule {}
