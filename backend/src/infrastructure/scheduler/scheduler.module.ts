import { Global, Module } from '@nestjs/common'
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule'
import { IS_SCHEDULER_PROCESS } from './scheduler.constants'
import { SchedulerManager } from './scheduler-manager.service'

@Global()
@Module({
  imports: [
    NestScheduleModule.forRoot({
      cronJobs: IS_SCHEDULER_PROCESS,
      intervals: IS_SCHEDULER_PROCESS,
      timeouts: IS_SCHEDULER_PROCESS
    })
  ],
  providers: [SchedulerManager],
  exports: [SchedulerManager]
})
export class SchedulerModule {}
