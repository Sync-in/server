import { i18nLocale } from '../../../common/i18n.js'
import { af } from './af.js'
import { be } from './be.js'
import { bg } from './bg.js'
import { bs } from './bs.js'
import { ca } from './ca.js'
import { cs } from './cs.js'
import { da } from './da.js'
import { de } from './de.js'
import { el } from './el.js'
import { eo } from './eo.js'
import { es } from './es.js'
import { et } from './et.js'
import { fi } from './fi.js'
import { fil } from './fil.js'
import { fr } from './fr.js'
import { ga } from './ga.js'
import { gl } from './gl.js'
import { hi } from './hi.js'
import { hr } from './hr.js'
import { hu } from './hu.js'
import { id } from './id.js'
import { ig } from './ig.js'
import { is } from './is.js'
import { it } from './it.js'
import { ja } from './ja.js'
import { ka } from './ka.js'
import { kk } from './kk.js'
import { ko } from './ko.js'
import { lo } from './lo.js'
import { lt } from './lt.js'
import { lv } from './lv.js'
import { mk } from './mk.js'
import { mn } from './mn.js'
import { ms } from './ms.js'
import { nl } from './nl.js'
import { nn } from './nn.js'
import { no } from './no.js'
import { pl } from './pl.js'
import { pt } from './pt.js'
import { pt_BR } from './pt_br.js'
import { ro } from './ro.js'
import { ru } from './ru.js'
import { si } from './si.js'
import { sk } from './sk.js'
import { sl } from './sl.js'
import { sq } from './sq.js'
import { sr } from './sr.js'
import { sv } from './sv.js'
import { sw } from './sw.js'
import { ta } from './ta.js'
import { th } from './th.js'
import { tr } from './tr.js'
import { uk } from './uk.js'
import { uz } from './uz.js'
import { vi } from './vi.js'
import { zh } from './zh.js'

export const translations = new Map<i18nLocale, Record<string, string>>([
  ['af', af],
  ['be', be],
  ['bg', bg],
  ['bs', bs],
  ['ca', ca],
  ['cs', cs],
  ['da', da],
  ['de', de],
  ['el', el],
  ['eo', eo],
  ['es', es],
  ['et', et],
  ['fi', fi],
  ['fil', fil],
  ['fr', fr],
  ['ga', ga],
  ['gl', gl],
  ['hi', hi],
  ['hr', hr],
  ['hu', hu],
  ['id', id],
  ['ig', ig],
  ['is', is],
  ['it', it],
  ['ja', ja],
  ['ka', ka],
  ['kk', kk],
  ['ko', ko],
  ['lo', lo],
  ['lt', lt],
  ['lv', lv],
  ['mk', mk],
  ['mn', mn],
  ['ms', ms],
  ['nl', nl],
  ['nn', nn],
  ['no', no],
  ['pl', pl],
  ['pt', pt],
  ['pt-BR', pt_BR],
  ['ro', ro],
  ['ru', ru],
  ['si', si],
  ['sk', sk],
  ['sl', sl],
  ['sq', sq],
  ['sr', sr],
  ['sv', sv],
  ['sw', sw],
  ['ta', ta],
  ['th', th],
  ['tr', tr],
  ['uk', uk],
  ['uz', uz],
  ['vi', vi],
  ['zh', zh]
])

export function translateObject(language: i18nLocale, obj: Record<string, string>): Record<string, string> {
  if (!language || !translations.has(language)) return obj
  const tr = translations.get(language)
  if (!tr) return obj
  for (const key in obj) {
    const v = obj[key]
    const t = tr[v]
    if (t) obj[key] = t
  }
  return obj
}
