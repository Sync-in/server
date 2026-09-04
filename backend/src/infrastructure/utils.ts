export function redactRedisUrl(url: string): string {
  const parsedUrl = new URL(url)
  if (!parsedUrl.password) return url

  parsedUrl.password = '********'
  return parsedUrl.toString()
}
