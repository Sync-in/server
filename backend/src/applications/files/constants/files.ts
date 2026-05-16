export const DEFAULT_CHECKSUM_ALGORITHM = 'sha512-256'
export const DEFAULT_HIGH_WATER_MARK = 1024 * 1024
export const DEFAULT_MIME_TYPE = 'application/octet-stream'
export const EXTRA_MIMES_TYPE = new Map([
  ['.go', 'text-x-go'],
  ['.gz', 'application-gzip'],
  ['.gzip', 'application-gzip'],
  ['.patch', 'text-x-patch'],
  ['.ps1', 'text-x-powershell'],
  ['.py', 'text-x-python'],
  ['.pyc', 'application-x-python-code'],
  ['.rb', 'text-x-ruby'],
  ['.rs', 'text-rust'],
  ['.tgz', 'application-gzip'],
  ['.ts', 'text-typescript'],
  ['.xcf', 'image-x-xcf']
])
export const COMPRESSION_EXTENSION = new Map([
  ['.zip', 'zip'],
  ['.gzip', 'gzip'],
  ['.tgz', 'tgz'],
  ['.gz', 'tgz'],
  ['.tar.gz', 'tgz'],
  ['.tar', 'tar']
])
