import {
  isEmptyArray,
  isEmptyBoolean,
  isEmptyNumber,
  isEmptyObject,
  isEmptyPresent,
  isEmptyString,
  type FieldDef,
  type IsEmptyFn,
} from '@umpire/core'

import type { FieldIsEmptyMap } from '@umpire/dsl'

import type { JsonFieldDef, JsonIsEmptyStrategy } from './schema.js'

export type { FieldIsEmptyMap }

// The compiler identifies a strategy by function identity, so every entry must
// be the shared function rather than an equivalent local lambda.
const IS_EMPTY_STRATEGIES: Record<JsonIsEmptyStrategy, IsEmptyFn> = {
  string: isEmptyString,
  number: isEmptyNumber,
  boolean: isEmptyBoolean,
  array: isEmptyArray,
  object: isEmptyObject,
  present: isEmptyPresent,
}

export function isJsonIsEmptyStrategy(
  value: unknown,
): value is JsonIsEmptyStrategy {
  return typeof value === 'string' && value in IS_EMPTY_STRATEGIES
}

export function hydrateIsEmptyStrategy(
  strategy: JsonIsEmptyStrategy | undefined,
): FieldDef['isEmpty'] | undefined {
  if (strategy === undefined) {
    return undefined
  }

  if (!isJsonIsEmptyStrategy(strategy)) {
    throw new Error(
      `[@umpire/json] Unknown isEmpty strategy "${String(strategy)}"`,
    )
  }

  return IS_EMPTY_STRATEGIES[strategy]
}

/**
 * Hydrate every field's declared strategy for the expression compiler, which
 * needs the functions themselves to check a membership op against them.
 */
export function hydrateFieldIsEmpty(
  fields: Record<string, JsonFieldDef>,
): FieldIsEmptyMap {
  const hydrated: FieldIsEmptyMap = Object.create(null)

  for (const [field, definition] of Object.entries(fields)) {
    hydrated[field] = hydrateIsEmptyStrategy(definition.isEmpty)
  }

  return hydrated
}

export function getJsonIsEmptyStrategy(
  strategy: FieldDef['isEmpty'] | undefined,
): JsonIsEmptyStrategy | undefined {
  if (!strategy) {
    return undefined
  }

  return (Object.entries(IS_EMPTY_STRATEGIES).find(
    ([, candidate]) => candidate === strategy,
  )?.[0] ?? undefined) as JsonIsEmptyStrategy | undefined
}
