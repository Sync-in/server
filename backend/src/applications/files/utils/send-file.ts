/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { send, SendOptions, SendResult } from '@fastify/send'
import { HttpStatus, StreamableFile } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import { FileError } from '../models/file-error'
import { fileName, isPathExists, isPathIsDir, isPathIsReadable } from './files'

export class SendFile {
  private fileName: string

  constructor(
    private readonly filePath: string,
    private readonly asAttachment = true,
    private readonly downloadName = '',
    private readonly sendOptions: SendOptions = {
      acceptRanges: true,
      etag: true,
      dotfiles: 'allow',
      lastModified: true,
      cacheControl: false,
      index: false,
      highWaterMark: DEFAULT_HIGH_WATER_MARK
    }
  ) {}

  async checks() {
    if (!(await isPathExists(this.filePath))) {
      throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
    }
    if (await isPathIsDir(this.filePath)) {
      throw new FileError(HttpStatus.BAD_REQUEST, 'The location is a directory')
    }
    if (!(await isPathIsReadable(this.filePath))) {
      throw new FileError(HttpStatus.METHOD_NOT_ALLOWED, 'The location is not readable')
    }
  }

  async stream(req: FastifyRequest, res: FastifyReply): Promise<StreamableFile> {
    // SendStream manages HEAD (no including body in response) & GET request (with body)
    // Ranges, LastModified, Etag are also handled
    // Send function uses decodeURIComponent, but filePath is already decoded : we need to encode it again before passing it.
    const encodedFilePath = encodeURIComponent(this.filePath)
    this.fileName = this.downloadName ? encodeURIComponent(this.downloadName) : fileName(encodedFilePath)
    const sendResult: SendResult = await send(req.raw, encodedFilePath, this.sendOptions)
    // Check if the path was correctly validated
    if (sendResult.metadata['path'] === undefined) {
      throw new FileError(HttpStatus.BAD_REQUEST, 'Location not found')
    }
    if (this.asAttachment) {
      const downloadName = this.fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      sendResult.headers['content-disposition'] = `attachment; filename="${downloadName}";filename*=UTF-8''${this.fileName}`
    }
    res.headers(sendResult.headers)
    res.status(sendResult.statusCode)
    // sendStream.once('stream', () => console.log(`Sending: ${this.fileName}`))
    // sendStream.once('end', () => console.log(`Received: ${this.fileName}`))
    // sendStream.once('error', (e: Error) => console.error(`Transfer error : ${this.fileName} - ${e}`))
    return new StreamableFile(sendResult.stream)
  }
}
