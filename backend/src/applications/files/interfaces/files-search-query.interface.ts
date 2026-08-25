export type FilesSearchTermOperator = 'required' | 'excluded' | 'optional'

export interface FilesSearchTerm {
  rawValue: string
  regexpValue: string
  operator: FilesSearchTermOperator
  requiresLike: boolean
  quoted: boolean
  wildcard: boolean
}

export interface FilesSearchQuery {
  terms: FilesSearchTerm[]
  positiveTerms: FilesSearchTerm[]
  requiredTerms: FilesSearchTerm[]
  optionalTerms: FilesSearchTerm[]
  excludedTerms: FilesSearchTerm[]
}
