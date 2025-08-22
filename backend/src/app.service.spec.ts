/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Logger } from '@nestjs/common'
import cluster from 'node:cluster'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { AppService } from './app.service'
import { ENVIRONMENT_PREFIX } from './configuration/config.constants'
import { configuration, exportConfiguration } from './configuration/config.environment'
jest.mock('@socket.io/cluster-adapter', () => ({
  setupPrimary: jest.fn()
}))
import { setupPrimary } from '@socket.io/cluster-adapter'

describe(AppService.name, () => {
  let appService: AppService

  beforeAll(async () => {
    appService = new AppService()
    Logger.overrideLogger(['fatal'])
  })

  it('should be defined', () => {
    expect(appService).toBeDefined()
  })

  it('should clusterize', () => {
    // --- MASTER, adapter='cluster' -> covers setupPrimary()
    configuration.websocket.adapter = 'cluster'
    configuration.server.restartOnFailure = true

    const bootstrap = jest.fn()

    // IMPORTANT: do NOT call bootstrap() from fork mock
    const fakeWorker = { process: { pid: 1 } } as any
    cluster.fork = jest.fn(() => fakeWorker)

    const spyExit = jest.spyOn(cluster, 'on')

    // 1) master path (cluster.isPrimary true by default)
    expect(() => AppService.clusterize(bootstrap)).not.toThrow()

    // setupPrimary() must have run once (covers the “line 21” site)
    expect(setupPrimary).toHaveBeenCalledTimes(1)

    // fork called exactly workers times
    expect((cluster.fork as jest.Mock).mock.calls.length).toBe(configuration.server.workers)

    // --- Test exit handler with ONLY ONE registered handler
    // TRUE branch: restart twice -> fork called +2
    const forkCallsAfterMaster = (cluster.fork as jest.Mock).mock.calls.length
    AppService.schedulerPID = 1
    cluster.emit('exit', { process: { pid: 1 } } as any, 1 as any, 'SIGKILL' as any)
    AppService.schedulerPID = 0
    cluster.emit('exit', { process: { pid: 2 } } as any, 1 as any, 'SIGKILL' as any)
    expect((cluster.fork as jest.Mock).mock.calls.length).toBe(forkCallsAfterMaster + 2)

    // FALSE branch: no restart -> fork unchanged
    configuration.server.restartOnFailure = false
    const forkCallsAfterTrue = (cluster.fork as jest.Mock).mock.calls.length
    cluster.emit('exit', { process: { pid: 3 } } as any, 1 as any, 'SIGKILL' as any)
    expect((cluster.fork as jest.Mock).mock.calls.length).toBe(forkCallsAfterTrue)

    // --- MASTER again, adapter != 'cluster' -> covers the FALSE side of the adapter check
    configuration.websocket.adapter = null
    expect(() => AppService.clusterize(bootstrap)).not.toThrow()
    // setupPrimary should NOT be called again
    expect(setupPrimary).toHaveBeenCalledTimes(1)

    // --- WORKER path (else branch): bootstrap should be called exactly once here
    jest.replaceProperty(cluster, 'isPrimary', false)
    bootstrap.mockClear() // isolate bootstrap count for a worker branch
    expect(() => AppService.clusterize(bootstrap)).not.toThrow()
    expect(bootstrap).toHaveBeenCalledTimes(1)

    spyExit.mockClear()
  })

  it(`should use ${ENVIRONMENT_PREFIX} environment variables to override the configuration`, () => {
    let conf = exportConfiguration()
    expect(conf.logger.stdout).toBe(true)
    expect(conf.logger.colorize).toBe(true)
    const tmpSecretFile = path.join(os.tmpdir(), 'secret')
    fs.writeFileSync(tmpSecretFile, 'fooBAR8888')
    process.env[`${ENVIRONMENT_PREFIX}APPLICATIONS_FILES_ONLYOFFICE_SECRET`] = 'fooBAR'
    process.env[`${ENVIRONMENT_PREFIX}LOGGER_STDOUT`] = 'false'
    process.env[`${ENVIRONMENT_PREFIX}LOGGER_COLORIZE`] = '"false"'
    process.env[`${ENVIRONMENT_PREFIX}APPLICATIONS_FILES_MAXUPLOADSIZE`] = '8888'
    // docker compose secret file
    process.env[`${ENVIRONMENT_PREFIX}AUTH_TOKEN_ACCESS_SECRET_FILE`] = tmpSecretFile
    conf = exportConfiguration(true)
    expect(conf.applications.files.onlyoffice.secret).toBe('fooBAR')
    expect(conf.logger.stdout).toBe(false)
    expect(conf.logger.colorize).toBe(false)
    expect(conf.applications.files.maxUploadSize).toBe(8888)
    expect(conf.auth.token.access.secret).toBe('fooBAR8888')
    // clean up secret file
    fs.promises.rm(tmpSecretFile, { force: true }).catch(console.error)
  })
})
