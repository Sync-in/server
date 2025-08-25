/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { faker } from '@faker-js/faker'
import { ResultSetHeader } from 'mysql2/promise'
import { USER_PERMISSION, USER_ROLE } from '../../../../applications/users/constants/user'
import { Group } from '../../../../applications/users/schemas/group.interface'
import { groups } from '../../../../applications/users/schemas/groups.schema'
import { User } from '../../../../applications/users/schemas/user.interface'
import { usersGroups } from '../../../../applications/users/schemas/users-groups.schema'
import { users } from '../../../../applications/users/schemas/users.schema'
import { hashPassword } from '../../../../common/functions'
import { getDB } from '../db'

const alreadyUsed = ['sync-in', 'support@sync-in.com']

export const usersAndGroups = async () => {
  const newUsers: Partial<User>[] = [
    {
      login: 'sync-in',
      email: 'support@sync-in.com',
      firstName: 'Sync-in',
      lastName: 'Admin',
      role: USER_ROLE.ADMINISTRATOR,
      password: await hashPassword('password'),
      permissions: Object.values(USER_PERMISSION).join(',')
    }
  ]
  const newGroups: Partial<Group>[] = []

  for (let i = 0; i < 10; i++) {
    let login = faker.person.firstName()
    let email = faker.internet.email()
    while (alreadyUsed.includes(login) || alreadyUsed.includes(email)) {
      login = faker.person.firstName()
      email = faker.internet.email()
    }
    alreadyUsed.push(login, email)
    newUsers.push({
      login: login,
      email: email,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      password: await hashPassword('password'),
      permissions: faker.helpers.arrayElements(Object.values(USER_PERMISSION)).join(',')
    })
  }

  for (let i = 0; i < 5; i++) {
    let name = faker.commerce.department()
    while (alreadyUsed.includes(name)) {
      name = faker.commerce.department()
    }
    alreadyUsed.push(name)
    newGroups.push({
      name: name,
      description: faker.company.buzzPhrase(),
      type: 0
    })
  }

  const db = await getDB()

  console.log('Seed start')
  const usersInfo: ResultSetHeader = (await db.insert(users).values(newUsers as any))[0]
  console.log('users: ', usersInfo.info)
  const groupsInfo: ResultSetHeader = (await db.insert(groups).values(newGroups as any))[0]
  console.log('groups: ', groupsInfo.info)

  const usersId = (await db.select({ id: users.id }).from(users)).map((r) => r.id)
  const groupsId = (await db.select({ id: groups.id }).from(groups)).map((r) => r.id)
  const newUsersGroups = usersId.map((uid) => ({ userId: uid, groupId: groupsId[Math.floor(Math.random() * groupsId.length)] }))
  const usersGroupsInfo: ResultSetHeader = (await db.insert(usersGroups).values(newUsersGroups))[0]
  console.log('users & groups: ', usersGroupsInfo.info)

  db.$client.end()
}

if (require.main === module) {
  usersAndGroups().then(() => console.log('Seed done'))
}
