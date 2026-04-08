import { isEmptyPresent } from './emptiness.js'
import type { FieldDef } from './types.js'

export function isSatisfied(value: unknown, fieldDef?: FieldDef): boolean {
  if (fieldDef?.isEmpty) {
    return !fieldDef.isEmpty(value)
  }

  return !isEmptyPresent(value)
}
