export const allSpecialCharacters = new RegExp(/[!@#$%^&*()~`,.?":{}|<>_+-]/g)
export const quotaRegexp = new RegExp('\\s*(\\d+)\\s*(MB|GB|TB).*', 'i')
export const validHttpSchemaRegexp = /^https?:\/\//

export function escapeRegexp(input: string): string {
  return input.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1')
}
