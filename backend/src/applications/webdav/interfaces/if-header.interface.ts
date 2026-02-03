export interface IfHeader {
  path?: string
  token?: { mustMatch: boolean; value: string }
  etag?: { mustMatch: boolean; value: string }
  haveLock?: { mustMatch: boolean }
}
