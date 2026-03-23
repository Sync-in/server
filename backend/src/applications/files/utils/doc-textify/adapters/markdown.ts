import fs from 'fs/promises'

const regexMarkdownCommon = /[`*_#>|[\]()!~-]/g

function normalizeMarkdown(content: string): string {
  return content.replace(regexMarkdownCommon, ' ')
}

export async function parseMarkdown(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, { encoding: 'utf8' })
  return normalizeMarkdown(content)
}
