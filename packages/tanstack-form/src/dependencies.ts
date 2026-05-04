import type { Umpire, FieldDef } from '@umpire/core'

export function getUmpireLinkedFields<F extends Record<string, FieldDef>, C extends Record<string, unknown>>(
  engine: Umpire<F, C>,
  fieldName: string,
  options?: {
    excludeSelf?: boolean
    listenTo?: string[]
  },
): string[] {
  if (options?.listenTo) {
    return [...options.listenTo]
  }

  const graph = engine.graph()
  const result = new Set<string>()

  for (const edge of graph.edges) {
    if (edge.to === fieldName) {
      result.add(edge.from)
    }
  }

  if (options?.excludeSelf !== false) {
    result.delete(fieldName)
  }

  return [...result].sort()
}
