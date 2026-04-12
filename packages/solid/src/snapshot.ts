function snapshotValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (value instanceof Date) {
    return new Date(value.getTime())
  }

  if (Array.isArray(value)) {
    return value.map((entry) => snapshotValue(entry))
  }

  if (value instanceof Map) {
    return new Map(
      Array.from(value.entries(), ([key, entry]) => [snapshotValue(key), snapshotValue(entry)]),
    )
  }

  if (value instanceof Set) {
    return new Set(Array.from(value.values(), (entry) => snapshotValue(entry)))
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype === Object.prototype || prototype === null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, snapshotValue(entry)]),
    )
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      return value
    }
  }

  return value
}

export function snapshotRecord<T extends Record<string, unknown> | undefined>(
  value: T,
): T {
  if (!value) {
    return value
  }

  return Object.fromEntries(
    Object.keys(value).map((key) => [key, snapshotValue(value[key])]),
  ) as T
}
