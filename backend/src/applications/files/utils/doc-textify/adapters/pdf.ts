/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */
import { readFile } from 'node:fs/promises'
import { getDocumentProxy } from 'unpdf'
import type { PDFDocumentProxy } from 'unpdf/pdfjs'
import type { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'

// Type guard to filter true text items
interface TextItem {
  str: string
  transform: [number, number, number, number, number, number]
}
function isTextItem(item: any): item is TextItem {
  return typeof item.str === 'string' && Array.isArray(item.transform)
}

const ignorePdfBadFormat = new Set([0x0000, 0x0001])

/** Parse PDF files */
export async function parsePdf(filePath: string, options: DocTextifyOptions): Promise<string> {
  let doc: PDFDocumentProxy
  const buffer = await readFile(filePath)

  try {
    // Load the document, allowing system fonts as fallback
    const doc = await getDocumentProxy(new Uint8Array(buffer), {
      disableFontFace: true,
      verbosity: 0
    })
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
