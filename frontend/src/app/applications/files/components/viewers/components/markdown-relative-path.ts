/** Resolve a URL reference within the current repository and space/share, without performing I/O. */
export function resolveMarkdownRelativePath(documentPath: string, reference: string): string | null {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|[/#?\\])/i.test(reference)) return null
  const path = reference.split(/[?#]/, 1)[0]
  const segments = documentPath.split('/')
  if (segments.length < 3 || segments.some((segment) => !segment)) return null
  segments.pop()
  for (const encodedSegment of path.split('/')) {
    let segment: string
    try {
      segment = decodeURIComponent(encodedSegment)
    } catch {
      return null
    }
    if (
      segment.includes('/') ||
      segment.includes('\\') ||
      [...segment].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    ) {
      return null
    }
    if (!segment || segment === '.') continue
    if (segment === '..') {
      // Keep the repository and space/share alias. The server still enforces root permissions.
      if (segments.length <= 2) return null
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  return segments.length > 2 ? segments.join('/') : null
}
