import { snapshotValue } from '@umpire/core/snapshot'

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
