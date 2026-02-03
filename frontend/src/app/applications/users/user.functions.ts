import { API_USERS_AVATAR } from '@sync-in-server/backend/src/applications/users/constants/routes'

export function userAvatarUrl(login: string) {
  return `${API_USERS_AVATAR}/${login}`
}

export function myAvatarUrl() {
  return `${userAvatarUrl('me')}?random=${Math.floor(Math.random() * 1000)}`
}
