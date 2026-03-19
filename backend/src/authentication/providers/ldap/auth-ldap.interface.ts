import type { Entry } from 'ldapts'
import type { ConnectionOptions } from 'node:tls'
import { LDAP_COMMON_ATTR, LDAP_LOGIN_ATTR } from './auth-ldap.constants'

export type LdapUserEntry = Entry &
  Record<LDAP_LOGIN_ATTR | Exclude<(typeof LDAP_COMMON_ATTR)[keyof typeof LDAP_COMMON_ATTR], typeof LDAP_COMMON_ATTR.MEMBER_OF>, string> & {
    [LDAP_COMMON_ATTR.MEMBER_OF]?: string[]
  }
export type LdapCa = ConnectionOptions['ca']
