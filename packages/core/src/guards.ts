export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isObjectLike(
  value: unknown,
): value is object | ((...args: unknown[]) => unknown) {
  return (
    (typeof value === 'function' || typeof value === 'object') && value !== null
  )
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value)
}
