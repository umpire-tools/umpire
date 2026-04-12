import type { Rule } from 'eslint'
import type * as estree from 'estree'
import { isUmpireCall } from '../utils.js'

// Nodes augmented with the parent reference ESLint adds during traversal.
type AugmentedNode = estree.Node & { parent?: AugmentedNode }

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow calling umpire() inside React component or hook bodies without useMemo.',
      recommended: true,
    },
    messages: {
      inlineInit:
        'umpire() creates a dependency graph on every call. Move this outside the component or wrap it in useMemo(() => umpire(...), []).',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node: estree.CallExpression) {
        if (!isUmpireCall(node)) return

        const ancestors: estree.Node[] =
          context.sourceCode.getAncestors(node as estree.Node)

        let enclosingReactFunction = false
        let wrappedInUseMemo = false

        for (let i = ancestors.length - 1; i >= 0; i--) {
          const ancestor = ancestors[i]

          // Track useMemo wrapping: look for a function node whose direct
          // parent is a useMemo() call and that function is the first arg.
          if (FUNCTION_TYPES.has(ancestor.type)) {
            const parent = ancestors[i - 1]
            if (
              parent?.type === 'CallExpression' &&
              isUseMemoCall(parent as estree.CallExpression) &&
              (parent as estree.CallExpression).arguments[0] === ancestor
            ) {
              wrappedInUseMemo = true
            }

            // Check if this function looks like a React component or hook.
            const name = resolveFunctionName(
              ancestor as estree.Function,
              ancestors[i - 1],
            )
            if (name && isReactName(name)) {
              enclosingReactFunction = true
            }
          }
        }

        if (enclosingReactFunction && !wrappedInUseMemo) {
          context.report({ node: node as unknown as estree.Node, messageId: 'inlineInit' })
        }
      },
    }
  },
}

export default rule

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUseMemoCall(node: estree.CallExpression): boolean {
  const { callee } = node
  if (callee.type === 'Identifier') return callee.name === 'useMemo'
  if (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name === 'useMemo'
  }
  return false
}

/**
 * Returns the name of a function node, inspecting the parent node to handle
 * `const MyComp = () => {}` and `const MyComp = function() {}` patterns.
 */
function resolveFunctionName(
  fn: estree.Function,
  parent: estree.Node | undefined,
): string | null {
  // function MyComp() {} or function* myGen() {}
  if (
    (fn.type === 'FunctionDeclaration' || fn.type === 'FunctionExpression') &&
    fn.id
  ) {
    return fn.id.name
  }
  // const MyComp = () => {} or const MyComp = function() {}
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
    return parent.id.name
  }
  // { render: function() {} } — named property
  if (
    parent?.type === 'Property' &&
    !parent.computed &&
    parent.key.type === 'Identifier'
  ) {
    return parent.key.name
  }
  return null
}

function isReactName(name: string): boolean {
  return /^[A-Z]/.test(name) || name.startsWith('use')
}
