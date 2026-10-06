import { usersAndGroups } from './usersgroups.js'

async function main() {
  await usersAndGroups()
  console.log(`${usersAndGroups.name} Seed done`)
}

try {
  await main()
  console.log('All seeds done')
} catch (error) {
  console.error('Seed failed:', error)
  process.exitCode = 1
}
