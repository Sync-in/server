import fs from 'node:fs/promises'
import path from 'node:path'
import { configuration } from '../../../configuration/config.environment'
import { isPathInside } from '../../files/utils/files'
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

  constructor(props: any) {
    Object.assign(this, props)
  }

  static async makePaths(spaceAlias: string) {
    for (const p of [SpaceModel.getFilesPath(spaceAlias), SpaceModel.getTrashPath(spaceAlias)]) {
      await fs.mkdir(p, { recursive: true })
    }
  }

  static getHomePath(spaceAlias: string) {
    const spacesPath = path.resolve(configuration.applications.files.spacesPath)
    const homePath = path.resolve(spacesPath, spaceAlias)

    if (!isPathInside(spacesPath, homePath)) {
      throw new Error(`Invalid space home path for alias: ${spaceAlias}`)
    }

    return homePath
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
