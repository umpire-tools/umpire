type SetoidValue = { 'fantasy-land/equals': (other: unknown) => boolean }

function hasFantasyLandEquals(value: unknown): value is SetoidValue {
  return (
    value !== null &&
    typeof value === 'object' &&
    'fantasy-land/equals' in value &&
    typeof value['fantasy-land/equals'] === 'function'
  )
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (hasFantasyLandEquals(a)) {
    return a['fantasy-land/equals'](b)
  }

  return Object.is(a, b)
}
