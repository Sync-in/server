import fs from 'fs/promises'

export async function parseText(filePath: string): Promise<string> {
  return await fs.readFile(filePath, { encoding: 'utf8' })
}
