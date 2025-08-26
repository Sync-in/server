/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const DEFAULT_HIGH_WATER_MARK = 1024 * 1024
export const DEFAULT_MIME_TYPE = 'application/octet-stream'
export const EXTRA_MIMES_TYPE = new Map([
  ['.ts', 'text-typescript'],
  ['.py', 'text-x-python'],
  ['.tgz', 'application-gzip'],
  ['.gz', 'application-gzip'],
  ['.gzip', 'application-gzip']
])
export const COMPRESSION_EXTENSION = new Map([
  ['.zip', 'zip'],
  ['.gzip', 'gzip'],
  ['.tgz', 'tgz'],
  ['.gz', 'tgz'],
  ['.tar.gz', 'tgz'],
  ['.tar', 'tar']
])
