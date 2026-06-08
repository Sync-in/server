import { BlobReader, type FileEntry, ZipReader } from '@zip.js/zip.js'
import { openAsBlob } from 'node:fs'
import sax, { type SAXStream } from 'sax'

type EntrySelector<Context> = (entryPath: string) => Context | undefined
type ParserSetup<Context> = (parser: SAXStream, context: Context) => void

export async function parseZipXmlEntries<Context>(
  filePath: string,
  selectEntry: EntrySelector<Context>,
  setupParser: ParserSetup<Context>
): Promise<void> {
  const zipReader = new ZipReader(new BlobReader(await openAsBlob(filePath)), { useWebWorkers: false })

  try {
    for await (const entry of zipReader.getEntriesGenerator()) {
      if (entry.directory) continue
      const context = selectEntry(entry.filename)
      if (context === undefined) continue
      await parseXmlEntry(entry as FileEntry, context, setupParser)
    }
  } finally {
    await zipReader.close()
  }
}

export function collectElementText(parser: SAXStream, elementNames: string | readonly string[], onText: (text: string) => void): void {
  let buffer: string | undefined
  const matches = Array.isArray(elementNames) ? (name: string) => elementNames.includes(name) : (name: string) => name === elementNames

  parser.on('opentag', (node) => {
    if (matches(node.name)) buffer = ''
  })
  parser.on('text', (text) => {
    if (buffer !== undefined) buffer += text
  })
  parser.on('closetag', (name) => {
    if (buffer !== undefined && matches(name)) {
      onText(buffer)
      buffer = undefined
    }
  })
}

async function parseXmlEntry<Context>(entry: FileEntry, context: Context, setupParser: ParserSetup<Context>): Promise<void> {
  const parser = sax.createStream(true)
  let parseError: Error | undefined
  setupParser(parser, context)
  parser.on('error', (error) => {
    parseError = error
  })

  await entry.getData(
    new WritableStream<Uint8Array>({
      write(chunk) {
        parser.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))
        if (parseError) throw parseError
      },
      close() {
        parser.end()
        if (parseError) throw parseError
      }
    })
  )
}
