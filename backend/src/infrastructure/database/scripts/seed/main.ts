import { usersAndGroups } from './usersgroups'

async function main() {
  await usersAndGroups()
  console.log(`${usersAndGroups.name} Seed done`)
}

if (require.main === module) {
  main().then(() => console.log('All seeds done'))
}
