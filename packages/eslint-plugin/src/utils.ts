import type * as estree from 'estree'

export type FieldRef = {
  node: estree.Literal & { value: string }
  value: string
}

/**
 * Returns true when a CallExpression is `umpire({ ... })`.
 */
export function isUmpireCall(node: estree.CallExpression): boolean {
  return (
    node.callee.type === 'Identifier' &&
    node.callee.name === 'umpire' &&
    node.arguments.length >= 1 &&
    node.arguments[0].type === 'ObjectExpression'
  )
}

/**
 * Returns the `fields` ObjectExpression from an `umpire()` config argument,
 * or null if it can't be statically enumerated (e.g. contains spread elements).
 */
export function getFieldsConfig(
  callNode: estree.CallExpression,
): estree.ObjectExpression | null {
  const config = callNode.arguments[0]
  if (config.type !== 'ObjectExpression') return null

  const fieldsProp = config.properties.find(
    (p): p is estree.Property =>
      p.type === 'Property' &&
      !p.computed &&
      ((p.key.type === 'Identifier' && p.key.name === 'fields') ||
        (p.key.type === 'Literal' && p.key.value === 'fields')),
  )

  if (!fieldsProp || fieldsProp.value.type !== 'ObjectExpression') return null

  const fieldsObj = fieldsProp.value
  // If there are spreads we can't enumerate all field names — bail out to
  // avoid false positives.
  if (fieldsObj.properties.some((p) => p.type === 'SpreadElement')) return null

  return fieldsObj
}

/**
 * Returns the set of statically known field names from a `fields` object.
 */
export function getFieldNames(
  fieldsNode: estree.ObjectExpression,
): Set<string> {
  const names = new Set<string>()
  for (const prop of fieldsNode.properties) {
    if (prop.type !== 'Property' || prop.computed) continue
    if (prop.key.type === 'Identifier') {
      names.add(prop.key.name)
    } else if (
      prop.key.type === 'Literal' &&
      typeof prop.key.value === 'string'
    ) {
      names.add(prop.key.value)
    }
  }
  return names
}

/**
 * Returns the `rules` ArrayExpression from an `umpire()` config, or null.
 */
export function getRulesArray(
  callNode: estree.CallExpression,
): estree.ArrayExpression | null {
  const config = callNode.arguments[0]
  if (config.type !== 'ObjectExpression') return null

  const rulesProp = config.properties.find(
    (p): p is estree.Property =>
      p.type === 'Property' &&
      !p.computed &&
      ((p.key.type === 'Identifier' && p.key.name === 'rules') ||
        (p.key.type === 'Literal' && p.key.value === 'rules')),
  )

  if (!rulesProp || rulesProp.value.type !== 'ArrayExpression') return null
  return rulesProp.value
}

/**
 * Extracts all field-name string literals referenced in a rule factory call.
 *
 * Understands: enabledWhen, fairWhen, requires, disables, oneOf, anyOf, eitherOf.
 * Recurses into anyOf/eitherOf. Handles the `check(field, pred)` helper inside
 * disables source position.
 */
export function extractFieldRefs(node: estree.CallExpression): FieldRef[] {
  if (node.callee.type !== 'Identifier') return []

  const fn = node.callee.name
  const args = node.arguments.filter(
    (a): a is estree.Expression => a.type !== 'SpreadElement',
  )

  switch (fn) {
    case 'enabledWhen':
    case 'fairWhen':
      // enabledWhen(target, predicate, options?)
      return stringLiterals([args[0]])

    case 'requires':
      // requires(target, dep1, dep2, ..., options?)
      // All string-literal args are field names regardless of position.
      return stringLiterals(args)

    case 'disables':
      return extractFromDisables(args)

    case 'oneOf':
      return extractFromOneOf(args)

    case 'anyOf':
      return extractFromAnyOf(args)

    case 'eitherOf':
      return extractFromEitherOf(args)

    default:
      return []
  }
}

function extractFromDisables(args: estree.Expression[]): FieldRef[] {
  const refs: FieldRef[] = []
  const source = args[0]
  if (source) {
    if (isStringLiteral(source)) {
      refs.push({ node: source, value: source.value })
    } else if (
      source.type === 'CallExpression' &&
      source.callee.type === 'Identifier' &&
      source.callee.name === 'check'
    ) {
      const checkField = source.arguments[0]
      if (checkField && isStringLiteral(checkField)) {
        refs.push({ node: checkField, value: checkField.value })
      }
    }
  }

  const targets = args[1]
  if (targets?.type === 'ArrayExpression') {
    refs.push(
      ...stringLiterals(
        targets.elements.filter(
          (e): e is estree.Expression =>
            e !== null && e.type !== 'SpreadElement',
        ),
      ),
    )
  }

  return refs
}

function extractFromOneOf(args: estree.Expression[]): FieldRef[] {
  const branches = args[1]
  if (branches?.type !== 'ObjectExpression') return []
  const refs: FieldRef[] = []
  for (const prop of branches.properties) {
    if (prop.type !== 'Property') continue
    if (prop.value.type === 'ArrayExpression') {
      refs.push(
        ...stringLiterals(
          prop.value.elements.filter(
            (e): e is estree.Expression =>
              e !== null && e.type !== 'SpreadElement',
          ),
        ),
      )
    }
  }
  return refs
}

function extractFromAnyOf(args: estree.Expression[]): FieldRef[] {
  return args.flatMap((arg) =>
    arg.type === 'CallExpression' ? extractFieldRefs(arg) : [],
  )
}

function extractFromEitherOf(args: estree.Expression[]): FieldRef[] {
  const branches = args[1]
  if (branches?.type !== 'ObjectExpression') return []
  const refs: FieldRef[] = []
  for (const prop of branches.properties) {
    if (prop.type !== 'Property') continue
    if (prop.value.type === 'ArrayExpression') {
      for (const el of prop.value.elements) {
        if (el?.type === 'CallExpression') {
          refs.push(...extractFieldRefs(el))
        }
      }
    }
  }
  return refs
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function isStringLiteral(
  node: estree.Node,
): node is estree.Literal & { value: string } {
  return node.type === 'Literal' && typeof node.value === 'string'
}

export function getPropertyName(prop: estree.Property): string | null {
  if (prop.computed) return null

  if (prop.key.type === 'Identifier') {
    return prop.key.name
  }

  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
    return prop.key.value
  }

  return null
}

function stringLiterals(nodes: (estree.Node | null | undefined)[]): FieldRef[] {
  const refs: FieldRef[] = []
  for (const node of nodes) {
    if (node && isStringLiteral(node)) {
      refs.push({ node, value: node.value })
    }
  }
  return refs
}
