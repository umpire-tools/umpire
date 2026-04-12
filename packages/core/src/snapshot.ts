function cloneSnapshotValue<T>(
  value: T,
  seen: WeakMap<object, unknown>,
): T {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T
  }

  const cached = seen.get(value)
  if (cached) {
    return cached as T
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = []
    seen.set(value, clone)

    for (const entry of value) {
      clone.push(cloneSnapshotValue(entry, seen))
    }

    return clone as T
  }

  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>()
    seen.set(value, clone)

    for (const [key, entry] of value.entries()) {
      clone.set(cloneSnapshotValue(key, seen), cloneSnapshotValue(entry, seen))
    }

    return clone as T
  }

  if (value instanceof Set) {
    const clone = new Set<unknown>()
    seen.set(value, clone)

    for (const entry of value.values()) {
      clone.add(cloneSnapshotValue(entry, seen))
    }

    return clone as T
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype === Object.prototype || prototype === null) {
    const clone = Object.create(prototype) as Record<string, unknown>
    seen.set(value, clone)

    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneSnapshotValue(entry, seen)
    }

    return clone as T
  }

  return value
}

export function snapshotValue<T>(value: T): T {
  return cloneSnapshotValue(value, new WeakMap<object, unknown>())
}
