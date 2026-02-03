import { count, eq, or } from 'drizzle-orm'
import { USER_PERMISSION, USER_ROLE } from '../../../applications/users/constants/user'
import { User } from '../../../applications/users/schemas/user.interface'
import { users } from '../../../applications/users/schemas/users.schema'
import { hashPassword } from '../../../common/functions'
import { capitalizeString } from '../../../common/shared'
import { getDB } from './db'

interface InitUser extends Partial<User> {
  login: string
  password: string
  email: string
  firstName: string
  lastName: string
  role: USER_ROLE
  permissions?: string
  storageQuota?: number
}

async function createUserInDatabase(user: InitUser) {
  let failed: 0 | 1 = 0
  const db = await getDB()
  try {
    const nbUsers = (
      await db
        .select({ count: count() })
        .from(users)
        .where(or(eq(users.login, user.login), eq(users.email, user.email)))
    )[0].count
    if (nbUsers === 0) {
      console.log(`${user.lastName} *${user.login}* was not found, let's create it !`)
      await db.insert(users).values(user)
      console.log(`${user.lastName} *${user.login}* created successfully`)
    } else {
      console.warn(`${user.lastName} *${user.login}* already exists`)
    }
  } catch (e) {
    failed = 1
    console.error(`${user.lastName} *${user.login}* was not created`, e)
  }
  await db.$client.end()
  process.exit(failed)
}

async function parseArgs(): Promise<InitUser> {
  const args = process.argv.slice(2)
  // 1. Collect raw values for each flag
  const raw: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    const val = args[i + 1]
    if (key.startsWith('--') && val && !val.startsWith('--')) {
      raw[key.slice(2)] = val.trim()
      i++
    }
  }

  // 2. Derive and validate options with defaults
  const login = raw.login || 'sync-in'

  const email = raw.email?.trim() || `${login}@sync-in.com`

  const pwdPlain = raw.password && raw.password.length > 3 ? raw.password : 'sync-in'
  if (!raw.password || raw.password.length <= 3) {
    console.warn('Password invalid or not specified, using default.')
  }

  const password = await hashPassword(pwdPlain)

  const role = raw.role?.toLowerCase() === 'admin' ? USER_ROLE.ADMINISTRATOR : USER_ROLE.USER
  if (raw.role && !['admin', 'user'].includes(raw.role.toLowerCase())) {
    console.warn(`Unknown role '${raw.role}', defaulting to 'user'.`)
  }

  const storageQuota = (() => {
    const v = raw['storage-quota']
    const n = Number(v)
    if (v && Number.isInteger(n) && n >= 0) {
      return n
    }
    return null
  })()
  if (raw['storage-quota'] && storageQuota === null) {
    console.warn(`Invalid storage-quota '${raw['storage-quota']}', ignoring.`)
  }

  let permissions = raw.permissions || ''
  if (permissions === 'all') {
    permissions = Object.values(USER_PERMISSION).join(',')
  }

  const firstName = raw['first-name']?.trim() || capitalizeString(login)
  const lastName = raw['last-name']?.trim() || (role === USER_ROLE.ADMINISTRATOR ? 'Administrator' : 'User')

  return {
    login,
    password,
    email,
    firstName,
    lastName,
    role,
    permissions,
    storageQuota
  } satisfies InitUser
}

async function main() {
  const user = await parseArgs()
  await createUserInDatabase(user)
}

main().catch((e: Error) => console.error(e))
