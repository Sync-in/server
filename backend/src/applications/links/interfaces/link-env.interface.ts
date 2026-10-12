import type { LinkAsUser } from './link-guest.interface.js'

export type LinkEnv = [link: LinkAsUser, check: true, ok: true] | [link: LinkAsUser | undefined, check: string, ok: false]
