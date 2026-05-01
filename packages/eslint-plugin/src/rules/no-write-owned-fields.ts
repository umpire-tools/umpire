import type { Rule } from 'eslint'
import type * as estree from 'estree'

import { getPropertyName, isStringLiteral } from '../utils.js'

type Options = {
  fieldNames?: string[]
  checkWriteCandidates?: boolean
  checkDrizzleHelpers?: boolean
  writeHelpers?: string[]
  drizzleHelpers?: string[]
}

const defaultOptions = {
  fieldNames: ['id'],
  checkWriteCandidates: true,
  checkDrizzleHelpers: true,
  writeHelpers: ['checkCreate', 'checkPatch'],
  drizzleHelpers: ['fromDrizzleTable', 'fromDrizzleModel'],
} satisfies Required<Options>

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow database-owned fields in Umpire write candidates and require explicit excludes in Drizzle helpers.',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          fieldNames: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
          checkWriteCandidates: { type: 'boolean' },
          checkDrizzleHelpers: { type: 'boolean' },
          writeHelpers: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
          drizzleHelpers: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
      },
    ],
    messages: {
      ownedWriteField:
        'Do not submit database-owned field "{{field}}" through {{helper}}().',
      missingExclude:
        '{{helper}}() should explicitly exclude database-owned field "{{field}}".',
    },
  },
  create(context) {
    const options = { ...defaultOptions, ...(context.options[0] as Options) }
    const ownedFields = new Set(options.fieldNames)
    const writeHelpers = new Set(options.writeHelpers)
    const drizzleHelpers = new Set(options.drizzleHelpers)

    return {
      CallExpression(node: estree.CallExpression) {
        const helper = getCallName(node)
        if (!helper) return

        if (options.checkWriteCandidates && writeHelpers.has(helper)) {
          checkWriteCandidate(context, helper, node, ownedFields)
        }

        if (options.checkDrizzleHelpers && drizzleHelpers.has(helper)) {
          checkDrizzleHelper(context, helper, node, ownedFields)
        }
      },
    }
  },
}

export default rule

function checkWriteCandidate(
  context: Rule.RuleContext,
  helper: string,
  node: estree.CallExpression,
  ownedFields: Set<string>,
): void {
  const candidateIndex = helper === 'checkPatch' ? 2 : 1
  const candidate = node.arguments[candidateIndex]
  if (!candidate || candidate.type === 'SpreadElement') return
  if (candidate.type !== 'ObjectExpression') return

  for (const prop of candidate.properties) {
    if (prop.type !== 'Property' || prop.computed) continue
    const name = getPropertyName(prop)
    if (!name || !ownedFields.has(name)) continue

    context.report({
      node: prop.key,
      messageId: 'ownedWriteField',
      data: { field: name, helper },
    })
  }
}

function checkDrizzleHelper(
  context: Rule.RuleContext,
  helper: string,
  node: estree.CallExpression,
  ownedFields: Set<string>,
): void {
  if (helper === 'fromDrizzleTable') {
    checkFromDrizzleTable(context, helper, node, ownedFields)
    return
  }

  if (
    helper === 'fromDrizzleModel' ||
    node.arguments[0]?.type === 'ObjectExpression'
  ) {
    checkFromDrizzleModel(context, helper, node, ownedFields)
    return
  }

  checkFromDrizzleTable(context, helper, node, ownedFields)
}

function checkFromDrizzleTable(
  context: Rule.RuleContext,
  helper: string,
  node: estree.CallExpression,
  ownedFields: Set<string>,
): void {
  const options = node.arguments[1]
  for (const field of ownedFields) {
    if (!options || options.type === 'SpreadElement') {
      reportMissingExclude(context, node.callee, helper, field)
      continue
    }
    if (
      options.type === 'ObjectExpression' &&
      !excludeContains(options, field)
    ) {
      reportMissingExclude(context, options, helper, field)
    }
  }
}

function checkFromDrizzleModel(
  context: Rule.RuleContext,
  helper: string,
  node: estree.CallExpression,
  ownedFields: Set<string>,
): void {
  const model = node.arguments[0]
  if (!model || model.type === 'SpreadElement') return
  if (model.type !== 'ObjectExpression') return

  for (const entry of model.properties) {
    if (entry.type !== 'Property') continue
    checkDrizzleModelEntry(context, helper, entry.value, ownedFields)
  }
}

function checkDrizzleModelEntry(
  context: Rule.RuleContext,
  helper: string,
  entry: estree.Expression | estree.Pattern,
  ownedFields: Set<string>,
): void {
  for (const field of ownedFields) {
    if (entry.type !== 'ObjectExpression') {
      reportMissingExclude(context, entry, helper, field)
      continue
    }

    if (hasTableProperty(entry) && !excludeContains(entry, field)) {
      reportMissingExclude(context, entry, helper, field)
    }
  }
}

function reportMissingExclude(
  context: Rule.RuleContext,
  node: estree.Node,
  helper: string,
  field: string,
): void {
  context.report({
    node,
    messageId: 'missingExclude',
    data: { helper, field },
  })
}

function excludeContains(
  options: estree.ObjectExpression,
  field: string,
): boolean {
  const exclude = options.properties.find(
    (prop): prop is estree.Property =>
      prop.type === 'Property' &&
      !prop.computed &&
      getPropertyName(prop) === 'exclude',
  )
  if (!exclude || exclude.value.type !== 'ArrayExpression') return false

  return exclude.value.elements.some(
    (element) =>
      element !== null && isStringLiteral(element) && element.value === field,
  )
}

function hasTableProperty(options: estree.ObjectExpression): boolean {
  return options.properties.some(
    (prop) =>
      prop.type === 'Property' &&
      !prop.computed &&
      getPropertyName(prop) === 'table',
  )
}

function getCallName(node: estree.CallExpression): string | null {
  if (node.callee.type === 'Identifier') return node.callee.name
  return null
}
