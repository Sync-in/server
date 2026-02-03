export enum MEMBER_TYPE {
  USER = 'user',
  GUEST = 'guest',
  LINK = 'link',
  GROUP = 'group',
  PGROUP = 'personal group'
}

export const MEMBER_TYPE_REVERSE = {
  user: 'user',
  guest: 'guest',
  link: 'user',
  group: 'group',
  ['personal group']: 'personal group'
}
