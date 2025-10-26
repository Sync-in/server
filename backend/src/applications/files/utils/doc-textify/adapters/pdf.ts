/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */
import path from 'node:path'
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'

// Enable parallel PDF parsing via Node.js worker threads
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
const pdfjsDistDir = path.dirname(require.resolve('pdfjs-dist/package.json'))
const standardFontsDir = path.join(pdfjsDistDir, 'standard_fonts') + '/'

// Type guard to filter true text items
function isTextItem(item: any): item is { str: string; transform: [number, number, number, number, number, number] } {
  return typeof item.str === 'string' && Array.isArray(item.transform)
}

const ignorePdfBadFormat = new Set([0x0000, 0x0001])

/** Parse PDF files */
export async function parsePdf(filePath: string, options: DocTextifyOptions): Promise<string> {
  let doc: PDFDocumentProxy

  try {
    // Load the document, allowing system fonts as fallback
    const loadingTask = getDocument({ url: filePath, disableFontFace: true, standardFontDataUrl: standardFontsDir, verbosity: VerbosityLevel.ERRORS })
    doc = await loadingTask.promise
    const fragments: string[] = []
    let lastY: number | undefined = undefined

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const { items } = await page.getTextContent()

      for (const item of items) {
        // Skip non-text items
        if (!isTextItem(item)) continue

        const currentY = item.transform[5]
        if (lastY !== undefined && currentY !== lastY) {
          fragments.push(options.newlineDelimiter)
        }

        fragments.push(item.str)
        lastY = currentY
      }
      page.cleanup()
    }

    const content = fragments.join('')
    if (ignorePdfBadFormat.has(content.charCodeAt(0))) {
      return ''
    }
    return content
  } catch (e) {
    if (options.outputErrorToConsole) {
      console.error('Error parsing PDF:', e)
    }
    throw e
  } finally {
    doc?.destroy().catch((e: Error) => console.error(e))
  }
}
