import type { Rule } from 'eslint'
import type * as estree from 'estree'
import {
  extractFieldRefs,
  getFieldNames,
  getFieldsConfig,
  getRulesArray,
  isUmpireCall,
} from '../utils.js'

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow field names in umpire rules that are not declared in the fields config.',
      recommended: true,
    },
    messages: {
      unknownField:
        "Field '{{field}}' is not declared in this umpire fields config.",
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node: estree.CallExpression) {
        if (!isUmpireCall(node)) return

        const fieldsNode = getFieldsConfig(node)
        // If fields can't be statically enumerated (e.g. has spreads), skip.
        if (!fieldsNode) return

        const knownFields = getFieldNames(fieldsNode)
        const rulesArray = getRulesArray(node)
        if (!rulesArray) return

        for (const element of rulesArray.elements) {
          if (!element || element.type !== 'CallExpression') continue
          for (const ref of extractFieldRefs(element)) {
            if (!knownFields.has(ref.value)) {
              context.report({
                node: ref.node as unknown as estree.Node,
                messageId: 'unknownField',
                data: { field: ref.value },
              })
            }
          }
        }
      },
    }
  },
}

export default rule
