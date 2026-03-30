/**
 * SignalProtocol — minimal interface that any signal library can implement.
 *
 * Uses .get()/.set() accessors (matching the TC39 Signal proposal shape).
 * `effect` and `batch` are optional — if omitted, penalties tracking is
 * unavailable but check/field availability still works.
 */
export interface SignalProtocol {
  signal<T>(initial: T): { get(): T; set(value: T): void }
  computed<T>(fn: () => T): { get(): T }
  effect?(fn: () => void | (() => void)): () => void
  batch?(fn: () => void): void
}
