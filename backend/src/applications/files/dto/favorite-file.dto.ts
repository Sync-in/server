export class FavoriteFileDto {
  path: string
  name: string
  isDir: boolean
  mime?: string
  size?: number
  mtime?: number
  ctime?: number
  ownerId?: number
  spaceId?: number
  spaceExternalRootId?: number
  shareExternalId?: number
}
