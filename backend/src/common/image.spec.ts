import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { maxFileSizeExceededError } from '../applications/files/utils/errors'
import { generateThumbnail, maxThumbnailInputSize } from './image'

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

describe(generateThumbnail.name, () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'thumbnail-svg-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('generates a WebP thumbnail from an SVG', async () => {
    const svgPath = path.join(tmpDir, 'image.svg')
    await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>')

    const thumbnail = await streamToBuffer(await generateThumbnail(svgPath, 32))

    await expect(sharp(thumbnail).metadata()).resolves.toMatchObject({ format: 'webp', width: 32, height: 32 })
  })

  it.each(['png', 'svg'])('rejects an oversized %s source before rendering', async (extension) => {
    const imagePath = path.join(tmpDir, `oversized.${extension}`)
    await writeFile(imagePath, '')
    await truncate(imagePath, maxThumbnailInputSize + 1)

    await expect(generateThumbnail(imagePath, 32)).rejects.toEqual(maxFileSizeExceededError())
  })

  it.each([
    ['XInclude', (secretPath: string) => `<xi:include href="${path.basename(secretPath)}"/>`],
    ['relative image xlink:href', (secretPath: string) => `<image xlink:href="${path.basename(secretPath)}" width="32" height="32"/>`],
    ['file image xlink:href', (secretPath: string) => `<image xlink:href="${pathToFileURL(secretPath).href}" width="32" height="32"/>`]
  ])('does not render local resources referenced through %s', async (_name, externalElement) => {
    const secretPath = path.join(tmpDir, 'secret.svg')
    const svgPath = path.join(tmpDir, 'image.svg')
    await writeFile(secretPath, '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>')
    await writeFile(
      svgPath,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xi="http://www.w3.org/2001/XInclude" xmlns:xlink="http://www.w3.org/1999/xlink"
        width="32" height="32">
        <rect width="32" height="32" fill="blue"/>
        ${externalElement(secretPath)}
      </svg>`
    )

    const thumbnail = await streamToBuffer(await generateThumbnail(svgPath, 32))
    const pixel = await sharp(thumbnail).removeAlpha().extract({ left: 16, top: 16, width: 1, height: 1 }).raw().toBuffer()

    expect(pixel[0]).toBeLessThan(50)
    expect(pixel[2]).toBeGreaterThan(200)
  })

  it('blocks file-mode rendering when SVG content is disguised with another extension', async () => {
    const disguisedSvgPath = path.join(tmpDir, 'image.png')
    await writeFile(disguisedSvgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>')

    await expect((async () => streamToBuffer(await generateThumbnail(disguisedSvgPath, 32)))()).rejects.toThrow()
  })
})
