import type { Rule } from 'eslint'
import type * as estree from 'estree'
import { getRulesArray, isStringLiteral, isUmpireCall } from '../utils.js'

type RequiresEntry = { target: string; dep: string }
type DisablesEntry = {
  source: string
  targets: string[]
  node: estree.CallExpression
}

function collectRequires(
  elements: estree.ArrayExpression['elements'],
): RequiresEntry[] {
  const requiresList: RequiresEntry[] = []

  for (const el of elements) {
    if (
      !el ||
      el.type !== 'CallExpression' ||
      el.callee.type !== 'Identifier'
    ) {
      continue
    }
    if (el.callee.name !== 'requires') {
      continue
    }

    const args = el.arguments.filter(
      (a): a is estree.Expression => a.type !== 'SpreadElement',
    )
    const targetArg = args[0]
    if (!targetArg || !isStringLiteral(targetArg)) {
      continue
    }
    const target = targetArg.value
    for (const depArg of args.slice(1)) {
      if (isStringLiteral(depArg)) {
        requiresList.push({ target, dep: depArg.value })
      }
    }
  }

  return requiresList
}

function collectDisables(
  elements: estree.ArrayExpression['elements'],
): DisablesEntry[] {
  const disablesList: DisablesEntry[] = []

  for (const el of elements) {
    if (
      !el ||
      el.type !== 'CallExpression' ||
      el.callee.type !== 'Identifier'
    ) {
      continue
    }
    if (el.callee.name !== 'disables') {
      continue
    }

    const args = el.arguments.filter(
      (a): a is estree.Expression => a.type !== 'SpreadElement',
    )
    const sourceArg = args[0]
    if (!sourceArg || !isStringLiteral(sourceArg)) {
      continue
    }
    const source = sourceArg.value
    const targetsArg = args[1]
    if (!targetsArg || targetsArg.type !== 'ArrayExpression') {
      continue
    }

    const targets = targetsArg.elements
      .filter(
        (e): e is estree.Literal & { value: string } =>
          e?.type === 'Literal' && typeof e.value === 'string',
      )
      .map((e) => e.value)

    if (targets.length > 0) {
      disablesList.push({ source, targets, node: el })
    }
  }

  return disablesList
}

/**
 * Detects pairs of rules that make a field permanently unavailable:
 *
 * Case A — dep disables the requiring field:
 *   requires(X, Y) + disables(Y, [X, ...])
 *   X needs Y to be available, but when Y is satisfied it disables X.
 *
 * Case B — field disables its own dep:
 *   requires(X, Y) + disables(X, [Y, ...])
 *   X needs Y to be available, but when X is satisfied it disables Y,
 *   so X's own requirement can never hold while X has a value.
 *
 * Only checks top-level string-literal sources/targets. Rules nested inside
 * anyOf/eitherOf have OR/branch semantics and are intentionally skipped.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow requires/disables combinations that make a field permanently unavailable.',
      recommended: true,
    },
    messages: {
      contradiction:
        "Contradicting rules: '{{target}}' requires '{{dep}}', but disables('{{disSource}}', ['{{disTarget}}', ...]) makes this impossible to satisfy.",
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node: estree.CallExpression) {
        if (!isUmpireCall(node)) return

        const rulesArray = getRulesArray(node)
        if (!rulesArray) return

        const requiresList = collectRequires(rulesArray.elements)
        const disablesList = collectDisables(rulesArray.elements)

        for (const req of requiresList) {
          for (const dis of disablesList) {
            // Case A: dep disables the requiring field
            // requires(X, Y) + disables(Y, [X]) → X can never be enabled
            const caseA =
              dis.source === req.dep && dis.targets.includes(req.target)

            // Case B: field disables its own dep
            // requires(X, Y) + disables(X, [Y]) → X's requirement can never hold
            const caseB =
              dis.source === req.target && dis.targets.includes(req.dep)

            if (caseA || caseB) {
              context.report({
                node: dis.node as unknown as estree.Node,
                messageId: 'contradiction',
                data: {
                  target: req.target,
                  dep: req.dep,
                  disSource: dis.source,
                  disTarget: caseA ? req.target : req.dep,
                },
              })
            }
          }
        }
      },
    }
  },
}

export default rule
