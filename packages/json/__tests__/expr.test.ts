import { compileExpr, getExprFieldRefs } from '../src/expr.js'

const fieldNames = new Set(['email', 'submit', 'accountType'])

describe('json expr bridge', () => {
  test('compileExpr handles check expressions with metadata', () => {
    const predicate = compileExpr(
      {
        op: 'check',
        field: 'email',
        check: { op: 'email' },
      },
      { fieldNames },
    )

    expect(predicate({ email: 'alex@example.com' }, {})).toBe(true)
    expect(predicate({ email: 'not-an-email' }, {})).toBe(false)
    expect(predicate({ email: null }, {})).toBe(false)
    expect(predicate._checkField).toBe('email')
    expect(predicate._namedCheck).toEqual({ __check: 'email' })
  })

  test('getExprFieldRefs includes check field and delegated refs', () => {
    expect(getExprFieldRefs({ op: 'check', field: 'email', check: { op: 'email' } })).toEqual(['email'])

    expect(
      getExprFieldRefs({
        op: 'and',
        exprs: [
          { op: 'eq', field: 'accountType', value: 'business' },
          { op: 'truthy', field: 'submit' },
        ],
      }),
    ).toEqual(['accountType', 'submit'])
  })

  test('compileExpr delegates non-check expressions', () => {
    const predicate = compileExpr(
      {
        op: 'and',
        exprs: [
          { op: 'eq', field: 'accountType', value: 'business' },
          { op: 'truthy', field: 'submit' },
        ],
      },
      { fieldNames },
    )

    expect(predicate({ accountType: 'business', submit: true }, {})).toBe(true)
    expect(predicate({ accountType: 'business', submit: false }, {})).toBe(false)
  })

  test('compileExpr supports nested check expressions inside combinators', () => {
    const predicate = compileExpr(
      {
        op: 'and',
        exprs: [
          { op: 'check', field: 'email', check: { op: 'email' } },
          { op: 'eq', field: 'accountType', value: 'business' },
        ],
      },
      { fieldNames },
    )

    expect(predicate({ email: 'alex@example.com', accountType: 'business' }, {})).toBe(true)
    expect(predicate({ email: 'invalid', accountType: 'business' }, {})).toBe(false)
  })

  test('compileExpr handles deeply nested trees with mixed check and non-check nodes', () => {
    let expression = { op: 'check', field: 'email', check: { op: 'email' } } as const

    for (let i = 0; i < 200; i++) {
      expression = {
        op: 'and',
        exprs: [
          expression,
          { op: 'eq', field: 'accountType', value: 'business' },
        ],
      }
    }

    const predicate = compileExpr(expression, { fieldNames })

    expect(predicate({ email: 'alex@example.com', accountType: 'business' }, {})).toBe(true)
    expect(predicate({ email: 'invalid', accountType: 'business' }, {})).toBe(false)
    expect(getExprFieldRefs(expression)).toEqual(['email', 'accountType'])
  })

  test('throws on unknown fields in check expressions', () => {
    expect(() =>
      compileExpr(
        { op: 'check', field: 'missing', check: { op: 'email' } },
        { fieldNames },
      ),
    ).toThrow('Unknown field "missing"')
  })
})
