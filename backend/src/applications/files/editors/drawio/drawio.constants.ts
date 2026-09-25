export const DRAWIO_INTERNAL_URI = '/drawio/' as const
export const DRAWIO_EXTENSIONS = new Set<string>(['drawio', 'dwb'])
export const DRAWIO_IMPORT_EXTENSIONS = new Set<string>(['vsdx', 'gliffy'])
export const DRAWIO_SUPPORTED_EXTENSIONS = new Set<string>([...DRAWIO_EXTENSIONS, ...DRAWIO_IMPORT_EXTENSIONS])
export const EMPTY_DRAWIO_XML =
  '<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'
