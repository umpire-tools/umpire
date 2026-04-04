export type HistoryFlags<K extends string> = Record<K, boolean>

export function createHistoryFlags<K extends string>(keys: readonly K[]) {
  const seed = Object.fromEntries(keys.map((key) => [key, false])) as HistoryFlags<K>

  return {
    init(): HistoryFlags<K> {
      return { ...seed }
    },

    remember(
      current: HistoryFlags<K>,
      next: Partial<Record<K, boolean>>,
    ): HistoryFlags<K> {
      let changed = false
      const updated = { ...current }

      for (const key of keys) {
        if (Boolean(next[key]) && updated[key] !== true) {
          updated[key] = true
          changed = true
        }
      }

      return changed ? updated : current
    },
  }
}
