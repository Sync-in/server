export enum GROUP_TYPE {
  USER,
  PERSONAL
}

export enum GROUP_VISIBILITY {
  VISIBLE, // default
  PRIVATE, // non-member users cannot see this group (default for personal group type)
  ISOLATED // hidden, its members cannot see it and cannot see each other
}
