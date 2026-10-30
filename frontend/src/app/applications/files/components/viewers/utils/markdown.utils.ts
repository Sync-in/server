export function renderMarkdownDestination(value: string, title: string): string {
  const escapedTitle = title.replace(/["\\]/g, '\\$&')
  const destination = /[\s()<>\\]/.test(value) ? `<${value.replace(/[\\<>]/g, '\\$&')}>` : value
  return title ? `${destination} "${escapedTitle}"` : destination
}

export function resolveMarkdownRelativeUrl(documentSource: string, scopeSource: string, reference: string): URL | null {
  if (
    !reference ||
    reference !== reference.trim() ||
    [...reference].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    return null
  }

  try {
    const documentUrl = new URL(documentSource, window.location.href)
    const scopeUrl = new URL(scopeSource, window.location.href)
    if (!scopeUrl.pathname.endsWith('/') || documentUrl.origin !== scopeUrl.origin || !documentUrl.pathname.startsWith(scopeUrl.pathname)) {
      return null
    }

    const targetUrl = new URL(reference, documentUrl)
    if (targetUrl.origin !== scopeUrl.origin || !targetUrl.pathname.startsWith(scopeUrl.pathname) || targetUrl.pathname.endsWith('/')) {
      return null
    }
    return targetUrl
  } catch {
    return null
  }
}
