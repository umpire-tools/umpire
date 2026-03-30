import { evaluate } from './evaluator.js'
import { buildGraph, detectCycles, exportGraph, topologicalSort } from './graph.js'
import { getInternalRuleMetadata } from './rules.js'
import { isSatisfied } from './satisfaction.js'
import type {
  ChallengeTrace,
  FieldDef,
  FieldValues,
  ResetRecommendation,
  Rule,
  Umpire,
} from './types.js'

function createEmptyContext<C extends Record<string, unknown>>(context: C | undefined): C {
  return (context ?? ({} as C)) as C
}

function validateRules<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(fields: F, rules: Rule<F, C>[]): void {
  const fieldNames = new Set(Object.keys(fields))

  for (const rule of rules) {
    const metadata = getInternalRuleMetadata(rule)

    if (metadata?.kind === 'oneOf') {
      for (const [branchName, branchFields] of Object.entries(metadata.branches)) {
        for (const field of branchFields) {
          if (!fieldNames.has(field)) {
            throw new Error(
              `Unknown field "${field}" in oneOf("${metadata.groupName}") branch "${branchName}"`,
            )
          }
        }
      }
    }

    for (const field of [...rule.sources, ...rule.targets]) {
      if (!fieldNames.has(field)) {
        throw new Error(`Unknown field "${field}" referenced by ${rule.type} rule`)
      }
    }
  }
}

export function umpire<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(config: { fields: F; rules: Rule<F, C>[] }): Umpire<F, C> {
  const { fields, rules } = config
  const fieldNames = Object.keys(fields) as Array<keyof F & string>

  validateRules(fields, rules)

  const graph = buildGraph(fields, rules)
  detectCycles(graph)
  const topoOrder = topologicalSort(graph, fieldNames)

  return {
    check(values, context, prev) {
      return evaluate(fields, rules, topoOrder, values, createEmptyContext(context), prev)
    },

    flag(before, after) {
      const beforeAvailability = evaluate(
        fields,
        rules,
        topoOrder,
        before.values,
        createEmptyContext(before.context),
      )
      const afterAvailability = evaluate(
        fields,
        rules,
        topoOrder,
        after.values,
        createEmptyContext(after.context),
        before.values,
      )
      const recommendations: ResetRecommendation<F>[] = []

      for (const field of fieldNames) {
        if (!beforeAvailability[field].enabled || afterAvailability[field].enabled) {
          continue
        }

        const currentValue = after.values[field]
        const suggestedValue = fields[field].default

        if (!isSatisfied(currentValue, fields[field])) {
          continue
        }

        if (Object.is(currentValue, suggestedValue)) {
          continue
        }

        recommendations.push({
          field,
          reason: afterAvailability[field].reason ?? 'field disabled',
          suggestedValue,
        })
      }

      return recommendations
    },

    init(overrides) {
      const values = {} as FieldValues<F>

      for (const field of fieldNames) {
        values[field] = fields[field].default
      }

      if (!overrides) {
        return values
      }

      for (const field of fieldNames) {
        if (field in overrides) {
          values[field] = overrides[field]
        }
      }

      return values
    },

    challenge(field, values, context, prev) {
      void field
      void values
      void context
      void prev

      throw new Error('challenge() not implemented yet')
    },

    graph() {
      return exportGraph(graph)
    },
  }
}
