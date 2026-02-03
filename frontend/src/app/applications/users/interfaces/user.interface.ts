import type { UserModel } from '@sync-in-server/backend/src/applications/users/models/user.model'

export type UserType = Omit<UserModel, 'permissions' | 'password'>

export type UserStatus = keyof Pick<UserType, 'isAdmin' | 'isUser' | 'isGuest' | 'isLink' | 'clientId'>
