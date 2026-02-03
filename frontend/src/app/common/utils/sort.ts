import { objectPropertyFromString } from '@sync-in-server/backend/src/common/shared'
import { ifStringContains } from './functions'

export type sortType = 'number' | 'string' | 'length' | 'date'

export function sortCollectionByType(type: sortType, objs: any[], property: string, asc: boolean) {
  const nestedProperty = ifStringContains(property, '.')
  switch (type) {
    case 'number':
      sortCollectionByNumber(objs, property, asc, nestedProperty)
      break
    case 'string':
      sortCollectionByString(objs, property, asc, nestedProperty)
      break
    case 'length':
      sortCollectionByLength(objs, property, asc, nestedProperty)
      break
    case 'date':
      sortCollectionByDate(objs, property, asc, nestedProperty)
      break
    default:
      console.warn(`Sort function not handles: ${type}.`)
  }
}

export function sortCollectionByDate(objs: any[], property: string, asc: boolean, nestedProperty = false) {
  objs.sort((a, b) => {
    const aD = new Date(nestedProperty ? objectPropertyFromString(a, property) : a[property]).getTime()
    const bD = new Date(nestedProperty ? objectPropertyFromString(b, property) : b[property]).getTime()
    if (isNaN(aD)) {
      return 1
    } else if (isNaN(bD)) {
      return -1
    } else if (aD === bD) {
      return 0
    }
    if (asc) {
      return aD > bD ? 1 : -1
    } else {
      return bD > aD ? 1 : -1
    }
  })
}

function sortCollectionByString(objs: any[], property: string, asc: boolean, nestedProperty = false) {
  objs.sort((a, b) => {
    const aN = nestedProperty ? (objectPropertyFromString(a, property) || 'z').toLowerCase() : a[property].toLowerCase()
    const bN = nestedProperty ? (objectPropertyFromString(b, property) || 'z').toLowerCase() : b[property].toLowerCase()
    if (asc) {
      return aN < bN ? 1 : aN > bN ? -1 : 0
    } else {
      return aN < bN ? -1 : aN > bN ? 1 : 0
    }
  })
}

function sortCollectionByLength(objs: any[], property: string, asc: boolean, nestedProperty = false) {
  objs.sort((a, b) => {
    const aNb = nestedProperty ? objectPropertyFromString(a, property).length : a[property].length
    const bNb = nestedProperty ? objectPropertyFromString(b, property).length : b[property].length
    if (asc) {
      return aNb - bNb
    } else {
      return bNb - aNb
    }
  })
}

export function sortCollectionByNumber(objs: any[], property: string, asc: boolean, nestedProperty = false) {
  objs.sort((a, b) => {
    const aNb = nestedProperty ? objectPropertyFromString(a, property) : a[property]
    const bNb = nestedProperty ? objectPropertyFromString(b, property) : b[property]
    if (asc) {
      return aNb - bNb
    } else {
      return bNb - aNb
    }
  })
}
