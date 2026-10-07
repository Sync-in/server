import { i18nLocale } from '../../../common/i18n.js'
import { ca } from './ca.js'
import { de } from './de.js'
import { es } from './es.js'
import { fr } from './fr.js'
import { hi } from './hi.js'
import { it } from './it.js'
import { ja } from './ja.js'
import { ko } from './ko.js'
import { nl } from './nl.js'
import { pl } from './pl.js'
import { pt } from './pt.js'
import { pt_BR } from './pt_br.js'
import { ru } from './ru.js'
import { tr } from './tr.js'
import { zh } from './zh.js'

export const translations = new Map<i18nLocale, Record<string, string>>([
  ['ca', ca],
  ['de', de],
  ['es', es],
  ['fr', fr],
  ['hi', hi],
  ['it', it],
  ['ja', ja],
  ['ko', ko],
  ['nl', nl],
  ['pl', pl],
  ['pt', pt],
  ['pt-BR', pt_BR],
  ['ru', ru],
  ['tr', tr],
  ['zh', zh]
])

export function translateObject(language: i18nLocale, obj: Record<string, string>): Record<string, string> {
  if (!language || !translations.has(language)) return obj
  const tr: Record<string, string> = translations.get(language)
  if (!tr) return obj
  for (const key in obj) {
    const v = obj[key]
    const t = tr[v]
    if (t) obj[key] = t
  }
  return obj
}
