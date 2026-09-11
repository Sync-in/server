# Scheduler

`SchedulerModule` owns the application-wide NestJS scheduler registry. It is global and is imported once by `AppModule`. Isolated Nest test modules must
import it explicitly when one of their providers depends on `SchedulerManager`.

The primary process assigns the scheduler role to one cluster worker through `SCHEDULER=enabled`. `IS_SCHEDULER_PROCESS` records that role when the
worker starts. NestJS cron jobs, intervals, and timeouts are enabled only in that worker, so scheduled work is not duplicated across the cluster.
`SchedulerManager.isSchedulerProcess` exposes the same state to providers that need role-specific initialization.

## Dependency availability

`SchedulerManager` initializes during Nest application bootstrap and observes the database and cache states published by `Availability`. Both
dependencies must be available for scheduled work to run.

When either dependency becomes unavailable, the manager:

- stops every active cron job in the shared registry and records it for recovery;
- clears every registered NestJS timeout, cancelling those that are still pending.

When both dependencies are available again, the manager restarts only the cron jobs it previously stopped. Missed cron executions are not replayed;
each job waits for its next scheduled occurrence. Deleted timeouts are not recreated. The `FilesScheduler` timeouts are armed only after the initial
database and cache connections have completed, and its five-minute indexing request is also covered by a recurring four-hour cron.

Stopping a job or deleting a timeout does not interrupt a callback that has already started. That callback must handle any dependency error raised
during its execution.

## Dynamic cron jobs

Most recurring work should use NestJS `@Cron`. `SchedulerManager.registerCron()` is available when a job must be created conditionally at runtime. A
job registered before the scheduler starts remains stopped until database and cache availability is confirmed. `unregisterCron()` safely removes it
from both the recovery set and the shared registry.

The MySQL cache adapter uses this API only when it cannot create its preferred MySQL event and must fall back to an in-process cleanup job.

Use cron jobs instead of `@Interval` for recurring application work. The manager can stop and restart cron jobs through the public NestJS API, while
the scheduler registry does not expose enough interval metadata to restart a cleared interval safely.
