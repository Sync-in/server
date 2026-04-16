import type { Logger } from '@nestjs/common'
import path from 'node:path'
import Tesseract from 'tesseract.js'
import { configuration } from '../../../../../configuration/config.environment'
import { makeDir } from '../../files'
import type { FilesContentIndexingOCRConfig } from '../../../files.config'

type OCRWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>
type OCRWorkerOptions = NonNullable<Parameters<typeof Tesseract.createWorker>[2]>

export class OCRManager {
  private static instance: OCRManager
  public worker: OCRWorker | null
  private readonly ocrConfig: FilesContentIndexingOCRConfig = configuration.applications.files.contentIndexing.ocr
  private readonly ocrLanguagesPath = this.ocrConfig.languagesPath ?? path.resolve(__dirname, '../../../assets/ocr-languages')
  private readonly ocrUserDefinedDpi = '300'
  private readonly ocrTrainedDataExtension = '.traineddata'
  private readonly ocrTrainedDataGzipExtension = '.traineddata.gz'
  private logger: Logger
  private workerInitializationPromise: Promise<OCRWorker | null> | null

  private constructor(logger: Logger) {
    this.logger = logger
    this.worker = null
    this.workerInitializationPromise = null
  }

  static getInstance(logger: Logger): OCRManager {
    if (!OCRManager.instance) {
      OCRManager.instance = new OCRManager(logger)
    }
    return OCRManager.instance
  }

  async start(): Promise<OCRWorker | null> {
    if (this.worker) {
      return this.worker
    }
    if (this.workerInitializationPromise) {
      return this.workerInitializationPromise
    }

    this.workerInitializationPromise = this.createWorkerFromConfiguration()
      .then((worker) => {
        this.worker = worker
        if (this.worker !== null) {
          this.logger.verbose({ tag: this.constructor.name, msg: 'Started' })
        }
        return worker
      })
      .finally(() => {
        this.workerInitializationPromise = null
      })
    return this.workerInitializationPromise
  }

  async stop(): Promise<void> {
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

    await worker
      .terminate()
      .then(() => this.logger.verbose({ tag: this.constructor.name, msg: 'Stopped' }))
      .catch((e) =>
        this.logger.error({
          tag: this.constructor.name,
          msg: `${e}`
        })
      )
  }

  private async createConfiguredWorker(languages: string[], options: OCRWorkerOptions): Promise<OCRWorker> {
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

  private async createWorkerFromConfiguration(): Promise<OCRWorker | null> {
    if (!this.ocrConfig.enabled) {
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
    if (this.ocrConfig.offline) {
      const offlineWorkerOptions = {
        langPath: this.ocrLanguagesPath,
        cacheMethod: 'none' as const
      }
      try {
        // First try for gzipped files: <lang>.traineddata.gz
        return await this.createConfiguredWorker(this.ocrConfig.languages, {
          ...offlineWorkerOptions,
          gzip: true
        })
      } catch (error) {
        this.logger.warn({
          tag: this.constructor.name,
          msg: `unable to load offline OCR languages as ${this.ocrTrainedDataGzipExtension}, retrying with ${this.ocrTrainedDataExtension}: ${error}`
        })
        // Fallback for non-gz files: <lang>.traineddata
        return this.createConfiguredWorker(this.ocrConfig.languages, {
          ...offlineWorkerOptions,
          gzip: false
        })
      }
    }
    return this.createConfiguredWorker(this.ocrConfig.languages, {
      cachePath: this.ocrLanguagesPath,
      cacheMethod: 'write' as const
    })
  }
}
