import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function fixIconsSymlinks() {
  const mimesDir = path.join(__dirname, '..', '..', 'dist', 'static', 'assets', 'mimes')

  if (!existsSync(mimesDir)) {
    console.warn(`postbuild - ${mimesDir} not found.`)
    process.exit(0)
  }

  const items = await fs.readdir(mimesDir, { withFileTypes: true })
  const symlinks = items.filter(item => item.isSymbolicLink())

  const operations = symlinks.map(async (link) => {
    const fullPath = path.join(mimesDir, link.name)

    const absoluteTarget = await fs.readlink(fullPath)
    const relativeTarget = `./${path.basename(absoluteTarget)}`

    await fs.unlink(fullPath)
    await fs.symlink(relativeTarget, fullPath)
  })

  await Promise.all(operations)
  console.log('postbuild - Icons symlinks fixed.')
}

