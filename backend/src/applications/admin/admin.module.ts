import { Module } from '@nestjs/common'
import { AdminSchedulerService } from './services/admin-scheduler.service'
import { AdminService } from './services/admin.service'

@Module({
  controllers: [],
  providers: [AdminService, AdminSchedulerService]
})
export class AdminModule {}
