import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { extractImages, getDocumentProxy } from 'unpdf'
import type { PDFDocumentProxy } from 'unpdf/pdfjs'
import type { DocTextifyOCRWorkerLike, DocTextifyOptions } from '../interfaces/doc-textify.interfaces'

const ignorePdfBadFormat = new Set([0x0000, 0x0001])

interface TextItem {
  str: string
  transform: [number, number, number, number, number, number]
}

type ExtractedImages = Awaited<ReturnType<typeof extractImages>>

function isTextItem(item: unknown): item is TextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    'transform' in item &&
    typeof (item as TextItem).str === 'string' &&
    Array.isArray((item as TextItem).transform)
  )
}

function shouldOcrImage(image: { width: number; height: number; channels: number }): boolean {
  const { width, height } = image

  // too small for OCR
  if (width < 32 || height < 32) return false

  // not enough pixels
  if (width * height < 4000) return false

  const minSide = Math.min(width, height)
  const maxSide = Math.max(width, height)
  const ratio = maxSide / minSide

  // too thin overall
  if (minSide < 12) return false

  // reject extreme shapes
  return ratio <= 8
}

function extractText(items: unknown[], newlineDelimiter: string): string {
  const fragments: string[] = []
  let lastY: number | undefined = undefined

  for (const item of items) {
    if (!isTextItem(item)) continue
    const currentY = item.transform[5]
    if (lastY !== undefined && currentY !== lastY) {
      fragments.push(newlineDelimiter)
    }
    fragments.push(item.str)
    lastY = currentY
  }

  return fragments.join('')
}

async function extractTextFromImages(images: ExtractedImages, options: DocTextifyOptions): Promise<string[]> {
  const contents: string[] = []
  const worker: DocTextifyOCRWorkerLike | undefined = options.ocrWorker

  if (!worker) return contents

  for (const image of images) {
    if (!shouldOcrImage(image)) {
      continue
    }

    let imageBuffer: Buffer | undefined

    try {
      let imageProcessor = sharp(image.data, {
        raw: {
          width: image.width,
          height: image.height,
          channels: image.channels
        }
      })

      if (image.channels === 4) {
        imageProcessor = imageProcessor.flatten({ background: '#ffffff' })
      }

      imageBuffer = await imageProcessor
        .resize({
          width: 1800,
          height: 1800,
          fit: 'inside',
          withoutEnlargement: true,
          fastShrinkOnLoad: true
        })
        .grayscale()
        .jpeg({ quality: 85 })
        // .png({ compressionLevel: 0, adaptiveFiltering: false })
        .toBuffer()
      const result = await worker.recognize(imageBuffer)
      const content = result.data?.text?.trim() || ''

      if (content.length > 0) {
        contents.push(content)
      }
    } catch {
      // ignore OCR errors for a single image
    } finally {
      imageBuffer = undefined
    }
  }

  return contents
}

export async function parsePdf(filePath: string, options: DocTextifyOptions): Promise<string> {
  let doc: PDFDocumentProxy | undefined
  const buffer = await readFile(filePath)
  const canUseOcr = !!options.ocrWorker

  try {
    doc = await getDocumentProxy(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), {
      disableFontFace: true,
      verbosity: 0
    })
    const contents: string[] = []

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)

      try {
        let pageText = ''
        try {
          const { items } = await page.getTextContent()
          pageText = extractText(items, options.newlineDelimiter).trim()
        } catch {
          // ignore text extraction error and fallback to image OCR when possible
        }
        const pageHasText = pageText.length > 1
        if (pageHasText) {
          contents.push(pageText)
          continue
        }
        if (!canUseOcr) {
          continue
        }
        let images: ExtractedImages = []
        try {
          images = await extractImages(doc, pageNum)
        } catch {
          // ignore image extraction error for this page
        }
        const pageHasImages = images.some(shouldOcrImage)
        if (!pageHasImages) {
          continue
        }
        const ocrContents = await extractTextFromImages(images, options)
        if (ocrContents.length > 0) {
          contents.push(...ocrContents)
        }
      } finally {
        page.cleanup()
      }
    }

    const content = contents.join(options.newlineDelimiter)
    if (content.length > 0 && ignorePdfBadFormat.has(content.charCodeAt(0))) {
      return ''
    }
    return content
  } finally {
    await doc?.destroy().catch(() => undefined)
  }
}
