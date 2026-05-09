export const SAMPLE_PATH_WITHOUT_EXT = '../assets/samples/sample'
export const SAMPLE_DOCUMENT_GROUPS = ['opendocument', 'microsoft'] as const
export type SampleDocumentGroup = (typeof SAMPLE_DOCUMENT_GROUPS)[number]
export type DocumentTypes = Record<string, string>

export const DOCUMENT_TYPES_BY_GROUP: Record<SampleDocumentGroup, DocumentTypes> = {
  opendocument: {
    Document: 'odt',
    Spreadsheet: 'ods',
    Presentation: 'odp'
  },
  microsoft: {
    'Microsoft Word': 'docx',
    'Microsoft Excel': 'xlsx',
    'Microsoft PowerPoint': 'pptx'
  }
}

export const DEFAULT_DOCUMENT_TYPES: DocumentTypes = {
  Text: 'txt',
  Markdown: 'md'
}

export function getDocumentTypes(groups: readonly SampleDocumentGroup[] = SAMPLE_DOCUMENT_GROUPS): DocumentTypes {
  const configuredDocumentTypes = groups.reduce(
    (documentTypes: DocumentTypes, group: SampleDocumentGroup) => ({ ...documentTypes, ...DOCUMENT_TYPES_BY_GROUP[group] }),
    {}
  )
  return { ...configuredDocumentTypes, ...DEFAULT_DOCUMENT_TYPES }
}

export const ALL_DOCUMENT_TYPES = getDocumentTypes()
