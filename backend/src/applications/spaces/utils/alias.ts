import { SPACE_ALIAS } from '../constants/spaces.js'

const RESERVED_ALIASES = new Set<string>([SPACE_ALIAS.PERSONAL])

export async function createUniqueAlias(alias: string, aliasExists: (alias: string) => Promise<unknown>): Promise<string> {
  const originalAlias = alias
  let count = 0

  while (RESERVED_ALIASES.has(alias) || (await aliasExists(alias))) {
    count += 1
    alias = `${originalAlias}-${count}`
  }
  return alias
}
