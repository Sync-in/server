export enum LDAP_LOGIN_ATTR {
  UID = 'uid',
  CN = 'cn',
  MAIL = 'mail',
  SAM = 'sAMAccountName',
  UPN = 'userPrincipalName'
}

export const LDAP_COMMON_ATTR = {
  MAIL: 'mail',
  GIVEN_NAME: 'givenName',
  SN: 'sn',
  CN: 'cn',
  DISPLAY_NAME: 'displayName',
  MEMBER_OF: 'memberOf'
} as const

export const ALL_LDAP_ATTRIBUTES = [...Object.values(LDAP_LOGIN_ATTR), ...Object.values(LDAP_COMMON_ATTR)]
