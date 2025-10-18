/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { de } from './de'
import { es } from './es'
import { fr } from './fr'
import { hi } from './hi'
import { it } from './it'
import { pt } from './pt'
import { zh } from './zh'

export const translations = { fr, de, es, hi, it, pt, zh }

export function translateObject<T>(language: string, obj: T): T {
  if (language?.length && Object.keys(translations).indexOf(language) > -1) {
    const tr = translations[language]
    for (const k of Object.keys(obj).filter((k) => !!obj[k] && tr[obj[k]])) {
      obj[k] = tr[obj[k]]
    }
  }
  return obj
}
