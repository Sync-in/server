import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function copyMimesForProd() {
  const srcDir = path.join(__dirname, '..', '..', 'frontend', 'src', 'assets', 'mimes')
  const destDir = path.join(__dirname, '..', '..', 'dist', 'static', 'assets', 'mimes')

  try {
    // Materialize MIME symlinks so npm includes every icon in the package
    await fs.cp(srcDir, destDir, {
      recursive: true,
      dereference: true
    })
    console.log('postbuild - mimes directory copied succesfully')
  } catch (err) {
    console.error('postbuild - Error with mimes copy:', err)
    process.exit(1)
  }
}
