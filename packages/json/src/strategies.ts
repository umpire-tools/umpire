import type { FieldDef } from '@umpire/core'

import type { JsonIsEmptyStrategy } from './schema.js'

const IS_EMPTY_STRATEGIES: Record<
  JsonIsEmptyStrategy,
  NonNullable<FieldDef['isEmpty']>
> = {
  string: (value) => typeof value !== 'string' || value.length === 0,
  number: (value) => typeof value !== 'number' || Number.isNaN(value),
  boolean: (value) => typeof value !== 'boolean',
  array: (value) => !Array.isArray(value) || value.length === 0,
  present: (value) => value === null || value === undefined,
}

export function isJsonIsEmptyStrategy(value: unknown): value is JsonIsEmptyStrategy {
  return typeof value === 'string' && value in IS_EMPTY_STRATEGIES
}

export function hydrateIsEmptyStrategy(
  strategy: JsonIsEmptyStrategy | undefined,
): FieldDef['isEmpty'] | undefined {
  if (strategy === undefined) {
    return undefined
  }

  if (!isJsonIsEmptyStrategy(strategy)) {
    throw new Error(`[umpire/json] Unknown isEmpty strategy "${String(strategy)}"`)
  }

  return IS_EMPTY_STRATEGIES[strategy]
}

export function getJsonIsEmptyStrategy(
  strategy: FieldDef['isEmpty'] | undefined,
): JsonIsEmptyStrategy | undefined {
  if (!strategy) {
    return undefined
  }

  return (Object.entries(IS_EMPTY_STRATEGIES).find(([, candidate]) => candidate === strategy)?.[0] ??
    undefined) as JsonIsEmptyStrategy | undefined
}
