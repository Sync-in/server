import { i18nLocale } from '../../../common/i18n'
import { de } from './de'
import { es } from './es'
import { fr } from './fr'
import { hi } from './hi'
import { it } from './it'
import { ja } from './ja'
import { ko } from './ko'
import { pl } from './pl'
import { pt } from './pt'
import { pt_BR } from './pt_br'
import { ru } from './ru'
import { tr } from './tr'
import { zh } from './zh'

export const translations = new Map<i18nLocale, Record<string, string>>([
  ['de', de],
  ['es', es],
  ['fr', fr],
  ['hi', hi],
  ['it', it],
  ['ja', ja],
  ['ko', ko],
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
