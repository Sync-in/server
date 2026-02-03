import path from 'node:path'

import { encodeUrl } from '../../../common/shared'
import { DEFAULT_MIME_TYPE } from '../../files/constants/files'
import { FileProps } from '../../files/interfaces/file-props.interface'
import { genEtag } from '../../files/utils/files'
import { PROPFIND_COLLECTION, SUPPORTED_LOCKS } from '../utils/webdav'

export class WebDAVFile implements Omit<FileProps, 'path'> {
  id: number
  name: string
  isDir: boolean
  size: number
  ctime: number
  mtime: number
  mime: string

  // extra props
  alias: string
  href: string

  constructor(props: Omit<FileProps, 'path'> & { alias?: string }, currentUrl: string, isCurrent = false) {
    Object.assign(this, props)
    if (props?.root?.alias) {
      this.alias = props.root.alias
    }
    this.href = encodeUrl(path.join(currentUrl, isCurrent ? '' : this.aliasName, this.isDir ? '/' : ''))
  }

  get aliasName() {
    return this.alias || this.name
  }

  get displayname() {
    return this.name
  }

  get creationdate() {
    // uses RFC3339 format (ISO 8601)
    return new Date(this.ctime).toISOString()
  }

  get getlastmodified() {
    // uses RFC1123 format
    return new Date(this.mtime).toUTCString()
  }

  get getcontentlength() {
    return this.isDir ? undefined : this.size
  }

  get getcontenttype() {
    if (this.isDir) {
      return undefined
    } else if (this.mime) {
      return this.mime.replaceAll('-', '/')
    }
    return DEFAULT_MIME_TYPE
  }

  get resourcetype() {
    return this.isDir ? PROPFIND_COLLECTION : null
  }

  get getetag() {
    return this.isDir ? undefined : genEtag(this)
  }

  get supportedlock() {
    return SUPPORTED_LOCKS
  }

  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get lockdiscovery() {
    // implemented in propfind method, used for propname case
    return null
  }
}
