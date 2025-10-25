/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export type Entries<T> = { [K in keyof T]: [K, T[K]] }[keyof T][]

export interface StorageQuota {
  storageUsage: number
  storageQuota: number
}

export type i18nLocaleSupported = 'de' | 'en' | 'es' | 'fr' | 'hi' | 'it' | 'ja' | 'ko' | 'pl' | 'pt' | 'pt-BR' | 'ru' | 'tr' | 'zh'
