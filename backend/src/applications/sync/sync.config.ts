import { IsEnum } from 'class-validator'
import { APP_STORE_REPOSITORY } from './constants/store'

export class AppStoreConfig {
  @IsEnum(APP_STORE_REPOSITORY)
  repository: APP_STORE_REPOSITORY = APP_STORE_REPOSITORY.PUBLIC
}
