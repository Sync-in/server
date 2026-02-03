export const DEFAULT_CHECKSUM_ALGORITHM = 'sha512-256'
export const DEFAULT_HIGH_WATER_MARK = 1024 * 1024
export const DEFAULT_MIME_TYPE = 'application/octet-stream'
export const EXTRA_MIMES_TYPE = new Map([
  ['.ts', 'text-typescript'],
  ['.py', 'text-x-python'],
  ['.tgz', 'application-gzip'],
  ['.gz', 'application-gzip'],
  ['.gzip', 'application-gzip']
])
export const COMPRESSION_EXTENSION = new Map([
  ['.zip', 'zip'],
  ['.gzip', 'gzip'],
  ['.tgz', 'tgz'],
  ['.gz', 'tgz'],
  ['.tar.gz', 'tgz'],
  ['.tar', 'tar']
])
