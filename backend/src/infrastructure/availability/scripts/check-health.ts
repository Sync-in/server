import { toErrorMessage } from '../../../common/errors.js'

async function checkHealth(): Promise<void> {
  const url = process.env.SYNC_IN_HEALTHCHECK_URL

  if (!url) {
    throw new Error('SYNC_IN_HEALTHCHECK_URL is not defined')
  }

  const response = await fetch(url, { redirect: 'manual' })

  if (response.status !== 200) {
    throw new Error(`Unexpected HTTP status ${response.status}`)
  }
}

checkHealth().catch((error: unknown) => {
  console.error(`Health check failed: ${toErrorMessage(error)}`)
  process.exitCode = 1
})
