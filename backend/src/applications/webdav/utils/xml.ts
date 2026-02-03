import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'

export const XML_NS_PREFIX = '@_'

export const XML_NS = `${XML_NS_PREFIX}xmlns`

export const XML_VERSION = {
  '?xml': {
    [`${XML_NS_PREFIX}version`]: '1.0',
    [`${XML_NS_PREFIX}encoding`]: 'utf-8',
    [`${XML_NS_PREFIX}standalone`]: 'yes'
  }
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: XML_NS_PREFIX,
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: false
})

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: XML_NS_PREFIX,
  format: false,
  suppressEmptyNode: true
})

export function xmlIsValid(content: string) {
  return XMLValidator.validate(content)
}

export function xmlBuild(content: any): string {
  return xmlBuilder.build({ ...XML_VERSION, ...content }) as string
}

export function xmlParse(content: any): any {
  return xmlParser.parse(content)
}
