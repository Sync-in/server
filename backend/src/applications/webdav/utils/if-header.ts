import { urlToPath } from '../../../common/functions'
import { IfHeader } from '../interfaces/if-header.interface'

//IF HEADER Before : (<locktoken:a-write-lock-token> ["I am an ETag"]) (["I am another ETag"])
//IF HEADER After : [{"path":"/webdav/specs/","token":{"mustMatch":true,"value":"urn:uuid:181d4fae-7d8c-11d0-a765-00a0c91e6bf2"},
//                     "etag":{"mustMatch":true,"value":"W/\"A weak ETag\""}},
//                    {"path":"/webdav/specs/","etag":{"mustMatch":true,"value":"\"strong ETag\""}}]

const ifHeaderRegExp = /(?:<([^>]+)>)?\s*\(([^)]+)\)/g
const ifHeaderInternalRegExp = /((not)|\[([^\]]+)\]|<(DAV:no-lock)>|<([^>]+)>|([^\s]+))/gi

function parseIfHeaderInternal(path: string, group: string) {
  let match = ifHeaderInternalRegExp.exec(group)

  let mustMatch = true
  const state: IfHeader = path ? { path: path } : {}

  while (match) {
    if (match[2]) {
      // not
      // inverse condition
      mustMatch = false
    } else if (match[5] || match[6]) {
      // check if a lock token match
      state.token = { mustMatch, value: match[5] || match[6] }
      mustMatch = true
    } else if (match[3]) {
      // check if etag is matching
      state.etag = { mustMatch, value: match[3] }
      mustMatch = true
    } else if (match[4]) {
      // check if no lock exists (DAV:no-lock)
      state.haveLock = { mustMatch: !mustMatch }
      mustMatch = true
    }
    match = ifHeaderInternalRegExp.exec(group)
  }

  return state
}

export function parseIfHeader(ifHeader: string): IfHeader[] {
  const orArray: IfHeader[] = []
  let match = ifHeaderRegExp.exec(ifHeader)
  let path = undefined

  while (match) {
    if (match[1]) {
      path = urlToPath(match[1])
    }
    orArray.push(parseIfHeaderInternal(path, match[2]))
    match = ifHeaderRegExp.exec(ifHeader)
  }
  return orArray
}

export function extractOneToken(ifHeaders: IfHeader[]): string {
  return ifHeaders[0].token.value
}

export function extractAllTokens(ifHeaders: IfHeader[]): string[] {
  return ifHeaders ? ifHeaders.map((i: IfHeader) => i.token?.value).filter(Boolean) : []
}
