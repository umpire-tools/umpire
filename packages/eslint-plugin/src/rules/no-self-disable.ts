import type { Rule } from 'eslint'
import type * as estree from 'estree'
import { isStringLiteral } from '../utils.js'

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a field from appearing as both the source and a target in disables().',
      recommended: true,
    },
    messages: {
      selfDisable:
        "'{{field}}' is listed as both the source and a target of disables(). A field cannot disable itself.",
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node: estree.CallExpression) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'disables'
        ) {
          return
        }

        const args = node.arguments.filter(
          (a): a is estree.Expression => a.type !== 'SpreadElement',
        )

        const source = args[0]
        if (!source || !isStringLiteral(source)) {
          return
        }
        const sourceName = source.value

        const targets = args[1]
        if (!targets || targets.type !== 'ArrayExpression') return

        for (const element of targets.elements) {
          if (
            element &&
            isStringLiteral(element) &&
            element.value === sourceName
          ) {
            context.report({
              node: element as unknown as estree.Node,
              messageId: 'selfDisable',
              data: { field: sourceName },
            })
          }
        }
      },
    }
  },
}

export default rule
