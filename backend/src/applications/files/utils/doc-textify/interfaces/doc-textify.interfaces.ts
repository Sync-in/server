export interface DocTextifyOCRWorkerLike {
  recognize: (image: Buffer) => Promise<{ data?: { text?: string } }>
}

export interface DocTextifyOptions {
  newlineDelimiter: string
  minCharsToExtract: number
  ocrWorker?: DocTextifyOCRWorkerLike | null
}
