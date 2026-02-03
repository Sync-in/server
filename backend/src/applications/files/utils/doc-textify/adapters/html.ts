import fs from 'fs/promises'
import { compile } from 'html-to-text'

const htmlConverter = compile({ wordwrap: false, preserveNewlines: false })

export async function parseHtml(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, { encoding: 'utf8' })
  return htmlConverter(content)
}
