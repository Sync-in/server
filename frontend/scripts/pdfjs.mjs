import { fileURLToPath } from 'url'
import fs from 'node:fs/promises'
import path from 'node:path'
import constants from 'node:constants'
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js/index-native.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pdfjsVersion = 'v5.6.205'
const pdfjsDownloadAsset = `pdfjs-${pdfjsVersion.slice(1)}-dist.zip`
const pdfjsReleaseURL = `https://api.github.com/repos/mozilla/pdf.js/releases/tags/${pdfjsVersion}`
const pdfjsAssetsDirectory = path.join(__dirname, '..', 'src', 'assets', 'pdfjs')
const pdfjsAssetsVersionFile = path.join(pdfjsAssetsDirectory, 'version')
const pdfjsViewerFile = path.join(pdfjsAssetsDirectory, 'web', 'viewer.html')
const pdfjsRequestAttempts = 3
const pdfjsRequestRetryDelay = 3_000
const pdfjsRequestTimeout = 60_000

async function fetchPdfjs(url, readResponse) {
  for (let attempt = 1; attempt <= pdfjsRequestAttempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(pdfjsRequestTimeout) })
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${url}`)
      }
      return await readResponse(response)
    } catch (error) {
      if (attempt === pdfjsRequestAttempts) {
        throw error
      }
      console.warn(`pdfjs - request failed (${attempt}/${pdfjsRequestAttempts}): ${error instanceof Error ? error.message : error}; retrying in 3s`)
      await new Promise((resolve) => setTimeout(resolve, pdfjsRequestRetryDelay))
    }
  }
}

async function checkPaths(paths) {
  try {
    for (const p of paths) {
      await fs.access(p, constants.R_OK)
    }
    return true
  } catch {
    return false
  }
}

async function extractZip(zipData, destination) {
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

async function updatePdfjs(pdfjsDownloadURL) {
  console.log('pdfjs - update to version:', pdfjsVersion, pdfjsDownloadURL)
  const zipData = await fetchPdfjs(pdfjsDownloadURL, async (response) => {
    if (!response.body) {
      throw new Error(`pdfjs - unable to download: empty response body ${pdfjsDownloadURL}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  })
  console.log('pdfjs - downloaded')
  await fs.rm(pdfjsAssetsDirectory, { recursive: true, force: true })
  await extractZip(zipData, pdfjsAssetsDirectory)
  console.log('pdfjs - extracted:', pdfjsAssetsDirectory)
  if (!(await checkPaths([pdfjsViewerFile]))) {
    throw new Error(`${pdfjsViewerFile} is missing`)
  }
  await fs.writeFile(pdfjsAssetsVersionFile, pdfjsVersion)
  console.log('pdfjs - assets update is done')
}

export async function checkPdfjs() {
  console.log('pdfjs - target version:', pdfjsVersion)
  if (await checkPaths([pdfjsAssetsDirectory, pdfjsAssetsVersionFile, pdfjsViewerFile])) {
    const currentVersion = await fs.readFile(pdfjsAssetsVersionFile, { encoding: 'utf8' })
    console.log('pdfjs - current version:', currentVersion)
    if (currentVersion === pdfjsVersion) {
      console.log('pdfjs - is up to date')
      return
    }
  }
  const data = await fetchPdfjs(pdfjsReleaseURL, (response) => response.json())
  const asset = data.assets.find((a) => a.name === pdfjsDownloadAsset)
  if (!asset) {
    throw new Error(`pdfjs - unable to find asset: ${pdfjsDownloadAsset}`)
  }
  await updatePdfjs(asset.browser_download_url)
}
