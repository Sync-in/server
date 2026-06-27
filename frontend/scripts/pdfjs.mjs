import { fileURLToPath } from 'url'
import fs from 'node:fs/promises'
import path from 'node:path'
import constants from 'node:constants'
import os from 'node:os'
import { Readable } from 'node:stream'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js/index-native.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pdfjsVersion = 'v5.7.284'
const pdfjsDownloadAsset = `pdfjs-${pdfjsVersion.slice(1)}-dist.zip`
const pdfjsReleaseURL = `https://api.github.com/repos/mozilla/pdf.js/releases/tags/${pdfjsVersion}`
let pdfjsDownloadURL
const pdfjsAssetsDirectory = path.join(__dirname, '..', 'src', 'assets', 'pdfjs')
const pdfjsAssetsVersionFile = path.join(pdfjsAssetsDirectory, 'version')

async function checkPaths(paths) {
  try {
    for (const p of paths) {
      await fs.access(p, constants.R_OK | constants.W_OK)
    }
    return true
  } catch {
    return false
  }
}

async function extractZip(zipPath, destination) {
  const zipData = await fs.readFile(zipPath)
  const zipReader = new ZipReader(new Uint8ArrayReader(zipData))
  const destinationPath = path.resolve(destination)

  try {
    const entries = await zipReader.getEntries()
    for (const entry of entries) {
      const entryPath = path.resolve(destinationPath, entry.filename)
      if (entryPath !== destinationPath && !entryPath.startsWith(`${destinationPath}${path.sep}`)) {
        throw new Error(`Invalid ZIP entry path: ${entry.filename}`)
      }
      if (entry.directory) {
        await fs.mkdir(entryPath, { recursive: true })
        continue
      }
      await fs.mkdir(path.dirname(entryPath), { recursive: true })
      await fs.writeFile(entryPath, await entry.getData(new Uint8ArrayWriter()))
    }
  } finally {
    await zipReader.close()
  }
}

async function updatePdfjs() {
  console.log('pdfjs - update to version:', pdfjsVersion, pdfjsDownloadURL)
  const tmpZip = path.join(os.tmpdir(), `${pdfjsDownloadAsset}`)
  const response = await fetch(pdfjsDownloadURL)
  if (!response.ok) {
    console.error('pdfjs - unable to download:', response.status, response.statusText, pdfjsDownloadURL)
    return
  }
  await fs.writeFile(tmpZip, Readable.fromWeb(response.body))
  console.log('pdfjs - downloaded:', tmpZip)
  await fs.rm(pdfjsAssetsDirectory, { recursive: true, force: true })
  await extractZip(tmpZip, pdfjsAssetsDirectory)
  console.log('pdfjs - extracted:', pdfjsAssetsDirectory)
  const viewerHtml = path.join(pdfjsAssetsDirectory, 'web', 'viewer.html')
  if (!(await checkPaths([viewerHtml]))) {
    console.warn(`${viewerHtml} is missing`)
  }
  await fs.writeFile(pdfjsAssetsVersionFile, pdfjsVersion)
  console.log('pdfjs - assets update is done')
}

export async function checkPdfjs() {
  let response
  try {
    response = await fetch(pdfjsReleaseURL)
  } catch (e) {
    console.error('pdfjs -', e.message, pdfjsReleaseURL)
    return
  }
  if (!response.ok) {
    console.error('pdfjs - unable to check version:', response.status, response.statusText, pdfjsReleaseURL)
    return
  }
  let data
  try {
    data = await response.json()
  } catch (e) {
    console.error('pdfjs - unable to check update:', e.message)
    return
  }
  const asset = data.assets.find((a) => a.name === pdfjsDownloadAsset)
  if (!asset) {
    console.error('pdfjs - unable to find asset:', pdfjsDownloadAsset)
    return
  }
  pdfjsDownloadURL = asset.browser_download_url
  console.log('pdfjs - target version:', pdfjsVersion)
  if (await checkPaths([pdfjsAssetsDirectory, pdfjsAssetsVersionFile])) {
    const currentVersion = await fs.readFile(pdfjsAssetsVersionFile, { encoding: 'utf8' })
    console.log('pdfjs - current version:', currentVersion)
    if (currentVersion === pdfjsVersion) {
      console.log('pdfjs - is up to date')
      return
    }
  }
  await updatePdfjs()
}
