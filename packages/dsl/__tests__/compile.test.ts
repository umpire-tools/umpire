import { compileExpr, getExprFieldRefs } from '../src/index.js'

const fieldNames = new Set(['accountType', 'planId', 'quantity', 'enabled'])
const conditions = {
  isAdmin: { type: 'boolean' as const },
  validPlans: { type: 'string[]' as const },
  accountTier: { type: 'string' as const },
}

describe('compileExpr', () => {
  test('compiles field comparisons and boolean combinators', () => {
    const predicate = compileExpr(
      {
        op: 'and',
        exprs: [
          { op: 'eq', field: 'accountType', value: 'business' },
          {
            op: 'or',
            exprs: [
              { op: 'gte', field: 'quantity', value: 10 },
              { op: 'truthy', field: 'enabled' },
            ],
          },
        ],
      },
      { fieldNames, conditions },
    )

    expect(
      predicate({ accountType: 'business', quantity: 5, enabled: true }, {}),
    ).toBe(true)
    expect(
      predicate({ accountType: 'business', quantity: 5, enabled: false }, {}),
    ).toBe(false)
    expect(predicate._checkField).toBeUndefined()
  })

  test('sets _checkField for single-field expressions', () => {
    const predicate = compileExpr(
      { op: 'eq', field: 'accountType', value: 'business' },
      { fieldNames, conditions },
    )

    expect(predicate._checkField).toBe('accountType')
  })

  test('compiles condition expressions including fieldInCond', () => {
    const predicate = compileExpr(
      {
        op: 'and',
        exprs: [
          { op: 'cond', condition: 'isAdmin' },
          { op: 'fieldInCond', field: 'planId', condition: 'validPlans' },
          { op: 'condEq', condition: 'accountTier', value: 'pro' },
        ],
      },
      { fieldNames, conditions },
    )

    expect(
      predicate(
        { planId: 'starter' },
        { isAdmin: true, validPlans: ['starter', 'team'], accountTier: 'pro' },
      ),
    ).toBe(true)
    expect(
      predicate(
        { planId: 'legacy' },
        { isAdmin: true, validPlans: ['starter', 'team'], accountTier: 'pro' },
      ),
    ).toBe(false)
  })

  test('throws when a declared condition is missing at runtime', () => {
    const predicate = compileExpr(
      { op: 'cond', condition: 'isAdmin' },
      { fieldNames, conditions },
    )

    expect(() => predicate({}, {})).toThrow(
      'Missing runtime condition "isAdmin"',
    )
  })

  test('throws on unknown fields and invalid fieldInCond condition types', () => {
    expect(() =>
      compileExpr(
        { op: 'eq', field: 'missing', value: 'x' },
        { fieldNames, conditions },
      ),
    ).toThrow('Unknown field "missing"')

    expect(() =>
      compileExpr(
        { op: 'fieldInCond', field: 'planId', condition: 'accountTier' },
        { fieldNames, conditions },
      ),
    ).toThrow('"fieldInCond" requires an array condition')
  })

  test('allows undeclared conditions when explicitly enabled', () => {
    const predicate = compileExpr(
      { op: 'cond', condition: 'featureFlag' },
      { fieldNames, allowUndeclaredConditions: true },
    )

    expect(predicate({}, { featureFlag: true })).toBe(true)
  })

  test('throws when and/or expression payloads are invalid', () => {
    expect(() =>
      compileExpr(
        { op: 'and', exprs: null as unknown as [] },
        { fieldNames, conditions },
      ),
    ).toThrow('"and" expression requires an exprs array')

    expect(() =>
      compileExpr(
        { op: 'or', exprs: null as unknown as [] },
        { fieldNames, conditions },
      ),
    ).toThrow('"or" expression requires an exprs array')
  })

  test('throws on unknown expression ops', () => {
    expect(() =>
      compileExpr(
        {
          op: 'eqIgnoreCase',
          field: 'accountType',
          value: 'business',
        } as unknown as Parameters<typeof compileExpr>[0],
        { fieldNames, conditions },
      ),
    ).toThrow('Unknown expression op "eqIgnoreCase"')
  })

  test('getExprFieldRefs returns unique field refs', () => {
    expect(
      getExprFieldRefs({
        op: 'and',
        exprs: [
          { op: 'eq', field: 'accountType', value: 'business' },
          { op: 'truthy', field: 'enabled' },
          { op: 'eq', field: 'accountType', value: 'personal' },
        ],
      }),
    ).toEqual(['accountType', 'enabled'])
  })

  test('contains matches one primitive in an array value', () => {
    const predicate = compileExpr(
      { op: 'contains', field: 'planId', value: 'team' },
      { fieldNames, conditions },
    )

    expect(predicate({ planId: ['starter', 'team'] }, {})).toBe(true)
    expect(predicate({ planId: ['starter'] }, {})).toBe(false)
    expect(predicate({ planId: 'team' }, {})).toBe(false)
    expect(predicate({ planId: ['1'] }, {})).toBe(false)
    expect(predicate._checkField).toBe('planId')
    expect(
      getExprFieldRefs({ op: 'contains', field: 'planId', value: 'team' }),
    ).toEqual(['planId'])
  })
})
