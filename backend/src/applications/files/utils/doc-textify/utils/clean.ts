import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'

const regexAlphanumeric = /[a-zA-Z0-9]/
const regexpLinesAndTabs = /\r?\n|\r|\t|\u00A0/g

export function cleanContent(content: string, options: DocTextifyOptions) {
  if (!content || content.length <= options.minCharsToExtract) {
    return ''
  }

  let result = content[0]
  let prevChar = content[0]

  for (let i = 1; i < content.length; i++) {
    const currentChar = content[i]

    if (!regexAlphanumeric.test(currentChar) && currentChar === prevChar) {
      continue
    }

    result += currentChar
    prevChar = currentChar
  }

  return result.trim().replace(regexpLinesAndTabs, options.newlineDelimiter)
}
