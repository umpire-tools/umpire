import type { Rule } from 'eslint'
import type * as estree from 'estree'
import { isUmpireCall } from '../utils.js'

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

        let reactFunctionDepth = -1
        let useMemoDepth = -1

        for (let i = ancestors.length - 1; i >= 0; i--) {
          const ancestor = ancestors[i]

          if (!FUNCTION_TYPES.has(ancestor.type)) continue

          const parent = ancestors[i - 1]
          if (
            parent?.type === 'CallExpression' &&
            isUseMemoCall(parent as estree.CallExpression) &&
            (parent as estree.CallExpression).arguments[0] === ancestor &&
            useMemoDepth === -1
          ) {
            useMemoDepth = i
          }

          // Record the nearest React component or hook boundary so useMemo only
          // suppresses when it sits inside that boundary.
          const name = resolveFunctionName(
            ancestor as estree.Function,
            parent,
          )
          if (name && isReactName(name) && reactFunctionDepth === -1) {
            reactFunctionDepth = i
          }
        }

        const wrappedInUseMemo =
          useMemoDepth !== -1 && useMemoDepth > reactFunctionDepth

        if (reactFunctionDepth !== -1 && !wrappedInUseMemo) {
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
