import type { Logger } from '@nestjs/common'
import path from 'node:path'
import Tesseract from 'tesseract.js'
import { configuration } from '../../../../../configuration/config.environment'
import { makeDir } from '../../files'

export type PdfOCRWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>
type PdfOCRWorkerOptions = NonNullable<Parameters<typeof Tesseract.createWorker>[2]>

export class PdfOCRWorkerManager {
  private static instance: PdfOCRWorkerManager
  public worker: PdfOCRWorker | null
  private readonly ocrLanguagesPath = path.resolve(__dirname, '../../../assets/ocr-languages')
  private readonly ocrUserDefinedDpi = '300'
  private readonly ocrTrainedDataExtension = '.traineddata'
  private readonly ocrTrainedDataGzipExtension = '.traineddata.gz'
  private logger: Logger
  private workerInitializationPromise: Promise<PdfOCRWorker | null> | null

  private constructor(logger: Logger) {
    this.logger = logger
    this.worker = null
    this.workerInitializationPromise = null
  }

  static getInstance(logger: Logger): PdfOCRWorkerManager {
    if (!PdfOCRWorkerManager.instance) {
      PdfOCRWorkerManager.instance = new PdfOCRWorkerManager(logger)
    }
    return PdfOCRWorkerManager.instance
  }

  async start(): Promise<PdfOCRWorker | null> {
    if (this.worker) {
      return this.worker
    }
    if (this.workerInitializationPromise) {
      return this.workerInitializationPromise
    }
    this.logger.verbose({ tag: this.constructor.name, msg: 'Starting OCR' })
    this.workerInitializationPromise = this.createWorkerFromConfiguration()
      .then((worker) => {
        this.worker = worker
        return worker
      })
      .finally(() => {
        this.workerInitializationPromise = null
      })
    return this.workerInitializationPromise
  }

  async stop(): Promise<void> {
    this.logger.verbose({ tag: this.constructor.name, msg: 'Stopping OCR' })
    if (this.workerInitializationPromise) {
      await this.workerInitializationPromise.catch((e) =>
        this.logger.error({
          tag: this.constructor.name,
          msg: `Initialization: ${e}`
        })
      )
    }
    const worker = this.worker
    this.worker = null
    if (!worker) {
      return
    }
    await worker.terminate().catch((e) =>
      this.logger.error({
        tag: this.constructor.name,
        msg: `${e}`
      })
    )
  }

  private async createConfiguredWorker(languages: string[], options: PdfOCRWorkerOptions): Promise<PdfOCRWorker> {
    const worker = await Tesseract.createWorker(languages, Tesseract.OEM.LSTM_ONLY, {
      ...options,
      errorHandler: (e: unknown) =>
        this.logger.error({
          tag: this.constructor.name,
          msg: `${e}`
        }),
      logger: () => {
        // intentionally disabled
      }
    })
    await worker.setParameters({
      user_defined_dpi: this.ocrUserDefinedDpi
    })
    return worker
  }

  private async createWorkerFromConfiguration(): Promise<PdfOCRWorker | null> {
    const ocrOptions = configuration.applications.files.contentIndexing.ocr
    if (!ocrOptions.enabled) {
      return null
    }
    try {
      await makeDir(this.ocrLanguagesPath, true)
    } catch (e) {
      this.logger.error({
        tag: this.constructor.name,
        msg: `unable to create languages directory: ${e}`
      })
    }
    if (ocrOptions.offline) {
      const offlineWorkerOptions = {
        langPath: this.ocrLanguagesPath,
        cacheMethod: 'none' as const
      }
      try {
        // First try for gzipped files: <lang>.traineddata.gz
        return await this.createConfiguredWorker(ocrOptions.languages, {
          ...offlineWorkerOptions,
          gzip: true
        })
      } catch (error) {
        this.logger.warn({
          tag: this.constructor.name,
          msg: `unable to load offline OCR languages as ${this.ocrTrainedDataGzipExtension}, retrying with ${this.ocrTrainedDataExtension}: ${error}`
        })
        // Fallback for non-gz files: <lang>.traineddata
        return this.createConfiguredWorker(ocrOptions.languages, {
          ...offlineWorkerOptions,
          gzip: false
        })
      }
    }
    return this.createConfiguredWorker(ocrOptions.languages, {
      cachePath: this.ocrLanguagesPath,
      cacheMethod: 'write' as const
    })
  }
}
