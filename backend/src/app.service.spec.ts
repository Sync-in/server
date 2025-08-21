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
    configuration.server.restartOnFailure = true
    const callBack = jest.fn().mockReturnValue({ process: { pid: 1 } })
    cluster.fork = jest.fn(() => callBack())
    const spyExit = jest.spyOn(cluster, 'on')
    expect(() => AppService.clusterize(callBack)).not.toThrow()
    expect(callBack).toHaveBeenCalledTimes(configuration.server.workers)
    expect(cluster.fork).toHaveBeenCalledTimes(configuration.server.workers)
    callBack.mockClear()
    AppService.schedulerPID = 1
    cluster.emit('exit', { process: { pid: 1 } }, 1, 1)
    AppService.schedulerPID = 0
    cluster.emit('exit', { process: { pid: 1 } }, 1, 1)
    expect(spyExit).toHaveBeenCalled()
    expect(callBack).toHaveBeenCalledTimes(2)
    jest.replaceProperty(cluster, 'isPrimary', false)
    callBack.mockClear()
    expect(() => AppService.clusterize(callBack)).not.toThrow()
    expect(callBack).toHaveBeenCalledTimes(1)
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
    // cleanup secret file
    fs.promises.rm(tmpSecretFile, { force: true }).catch((e) => {
      console.error(e)
    })
  })
})
