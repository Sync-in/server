import { APP_STORE_PLATFORM, APP_STORE_REPOSITORY } from '../constants/store'

interface PackageManifest {
  package: string
  arch: string
  ext: string
  sha512: string
  size: number
  url: string
}

export interface AppStoreManifest {
  platform: {
    [APP_STORE_PLATFORM.WIN]: PackageManifest[]
    [APP_STORE_PLATFORM.MAC]: PackageManifest[]
    [APP_STORE_PLATFORM.LINUX]: PackageManifest[]
    [APP_STORE_PLATFORM.NODE]: PackageManifest[]
  }
  repository: APP_STORE_REPOSITORY
  version: string
  date: string
}
