import cluster from 'node:cluster'

export const SCHEDULER_ENV = 'SCHEDULER'
export enum SCHEDULER_STATE {
  ENABLED = 'enabled',
  DISABLED = 'disabled'
}
export const IS_SCHEDULER_PROCESS = cluster.isWorker && process.env[SCHEDULER_ENV] === SCHEDULER_STATE.ENABLED
