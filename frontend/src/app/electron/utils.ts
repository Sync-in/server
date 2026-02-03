import { SYNC_IN_SERVER_AGENT } from '@sync-in-server/backend/src/applications/sync/constants/sync'

export const electronAgentRegexp = new RegExp(`${SYNC_IN_SERVER_AGENT}`, 'i')

export function checkIfElectronApp(): boolean {
  return !!electronAgentRegexp.test(window.navigator.userAgent)
}
