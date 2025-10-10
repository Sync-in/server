/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { configuration } from '../../../configuration/config.environment'
import { SPACE_REPOSITORY } from '../constants/spaces'
import { SpaceRoot } from '../schemas/space-root.interface'
import { Space } from '../schemas/space.interface'

export class SpaceModel implements Space {
  id: number
  alias: string
  enabled: boolean
  name: string
  description: string
  storageQuota: number
  storageUsage: number
  storageIndexing: boolean
  modifiedAt: Date
  disabledAt: Date
  createdAt: Date

  // outside db schema
  root: SpaceRoot[] = []
  private _homePath: string
  private _filesPath: string
  private _trashPath: string

  constructor(props: any) {
    Object.assign(this, props)
  }

  get homePath(): string {
    return (this._homePath ||= path.join(configuration.applications.files.spacesPath, this.alias))
  }

  get filesPath(): string {
    return (this._filesPath ||= path.join(this.homePath, SPACE_REPOSITORY.FILES))
  }

  get trashPath(): string {
    return (this._trashPath ||= path.join(this.homePath, SPACE_REPOSITORY.TRASH))
  }

  static async makePaths(spaceAlias: string) {
    for (const p of [SpaceModel.getFilesPath(spaceAlias), SpaceModel.getTrashPath(spaceAlias)]) {
      await fs.mkdir(p, { recursive: true })
    }
  }

  static getHomePath(spaceAlias: string) {
    return path.join(configuration.applications.files.spacesPath, spaceAlias)
  }

  static getFilesPath(spaceAlias: string) {
    return path.join(SpaceModel.getHomePath(spaceAlias), SPACE_REPOSITORY.FILES)
  }

  static getTrashPath(spaceAlias: string) {
    return path.join(SpaceModel.getHomePath(spaceAlias), SPACE_REPOSITORY.TRASH)
  }

  static getRepositoryPath(spaceAlias: string, inTrash = false) {
    if (inTrash) return SpaceModel.getTrashPath(spaceAlias)
    return SpaceModel.getFilesPath(spaceAlias)
  }
}
