import { i18nLocaleSupported } from '@sync-in-server/backend/src/common/i18n'
import { dJs } from '../../app/common/utils/time'

const DAYJS_LOADER: Record<i18nLocaleSupported, () => Promise<unknown>> = {
  af: () => import('dayjs/esm/locale/af'),
  be: () => import('dayjs/esm/locale/be'),
  bg: () => import('dayjs/esm/locale/bg'),
  bs: () => import('dayjs/esm/locale/bs'),
  ca: () => import('dayjs/esm/locale/ca'),
  cs: () => import('dayjs/esm/locale/cs'),
  da: () => import('dayjs/esm/locale/da'),
  de: () => import('dayjs/esm/locale/de'),
  el: () => import('dayjs/esm/locale/el'),
  en: () => import('dayjs/esm/locale/en'),
  eo: () => import('dayjs/esm/locale/eo'),
  es: () => import('dayjs/esm/locale/es'),
  et: () => import('dayjs/esm/locale/et'),
  fi: () => import('dayjs/esm/locale/fi'),
  fil: () => import('dayjs/esm/locale/tl-ph'),
  fr: () => import('dayjs/esm/locale/fr'),
  ga: () => import('dayjs/esm/locale/ga'),
  gl: () => import('dayjs/esm/locale/gl'),
  hi: () => import('dayjs/esm/locale/hi'),
  hr: () => import('dayjs/esm/locale/hr'),
  hu: () => import('dayjs/esm/locale/hu'),
  id: () => import('dayjs/esm/locale/id'),
  ig: () => import('./dayjs-locales/ig.locale'),
  is: () => import('dayjs/esm/locale/is'),
  it: () => import('dayjs/esm/locale/it'),
  ja: () => import('dayjs/esm/locale/ja'),
  ka: () => import('dayjs/esm/locale/ka'),
  kk: () => import('dayjs/esm/locale/kk'),
  ko: () => import('dayjs/esm/locale/ko'),
  lo: () => import('dayjs/esm/locale/lo'),
  lt: () => import('dayjs/esm/locale/lt'),
  lv: () => import('dayjs/esm/locale/lv'),
  mk: () => import('dayjs/esm/locale/mk'),
  mn: () => import('dayjs/esm/locale/mn'),
  ms: () => import('dayjs/esm/locale/ms'),
  nl: () => import('dayjs/esm/locale/nl'),
  nn: () => import('dayjs/esm/locale/nn'),
  no: () => import('dayjs/esm/locale/nb'),
  pl: () => import('dayjs/esm/locale/pl'),
  pt: () => import('dayjs/esm/locale/pt'),
  'pt-BR': () => import('dayjs/esm/locale/pt-br'),
  ro: () => import('dayjs/esm/locale/ro'),
  ru: () => import('dayjs/esm/locale/ru'),
  si: () => import('dayjs/esm/locale/si'),
  sk: () => import('dayjs/esm/locale/sk'),
  sl: () => import('dayjs/esm/locale/sl'),
  sq: () => import('dayjs/esm/locale/sq'),
  sr: () => import('dayjs/esm/locale/sr'),
  sv: () => import('dayjs/esm/locale/sv'),
  sw: () => import('dayjs/esm/locale/sw'),
  ta: () => import('dayjs/esm/locale/ta'),
  th: () => import('dayjs/esm/locale/th'),
  tr: () => import('dayjs/esm/locale/tr'),
  uk: () => import('dayjs/esm/locale/uk'),
  uz: () => import('dayjs/esm/locale/uz-latn'),
  vi: () => import('dayjs/esm/locale/vi'),
  zh: () => import('dayjs/esm/locale/zh')
}

const DAYJS_LOCALE_CODE: Partial<Record<i18nLocaleSupported, string>> = {
  fil: 'tl-ph',
  no: 'nb',
  'pt-BR': 'pt-br',
  uz: 'uz-latn'
}

export async function loadDayjsLocale(language: string) {
  const loader = DAYJS_LOADER[language]
  if (!loader) return
  await loader()
  dJs.locale(DAYJS_LOCALE_CODE[language as i18nLocaleSupported] ?? language)
}
