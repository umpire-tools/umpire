import type { FieldDef } from './types.js'

type IsEmptyFn = NonNullable<FieldDef['isEmpty']>

export const isEmptyPresent: IsEmptyFn = (value) =>
  value === null || value === undefined

export const isEmptyString: IsEmptyFn = (value) =>
  typeof value !== 'string' || value.length === 0

export const isEmptyArray: IsEmptyFn = (value) =>
  !Array.isArray(value) || value.length === 0

export const isEmptyObject: IsEmptyFn = (value) => {
  if (
    isEmptyPresent(value) ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return true
  }

  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return false
    }
  }

  return true
}

export const isEmptyNumber: IsEmptyFn = (value) =>
  typeof value !== 'number' || Number.isNaN(value)

export const isEmptyBigInt: IsEmptyFn = (value) => typeof value !== 'bigint'

export const isEmptyBoolean: IsEmptyFn = (value) => typeof value !== 'boolean'
