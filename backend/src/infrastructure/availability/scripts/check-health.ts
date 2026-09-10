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
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Health check failed: ${message}`)
  process.exitCode = 1
})
