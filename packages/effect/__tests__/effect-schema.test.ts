import { formatEffectErrors } from '../src/effect-schema.js'

describe('formatEffectErrors', () => {
  test('formats a bare primitive issue as a root error', () => {
    expect(formatEffectErrors('Something went wrong')).toEqual([
      { field: '', message: 'Something went wrong' },
    ])
  })

  test('formats a bare issue object without a parse-error wrapper', () => {
    expect(
      formatEffectErrors({
        _tag: 'Pointer',
        path: ['email'],
        issue: 'Enter a valid email',
      }),
    ).toEqual([{ field: 'email', message: 'Enter a valid email' }])
  })

  test('unwraps Filter issues to surface the inner message', () => {
    expect(
      formatEffectErrors({
        _tag: 'Filter',
        issue: 'Passwords do not match',
      }),
    ).toEqual([{ field: '', message: 'Passwords do not match' }])
  })

  test('handles pointer issues without a path', () => {
    expect(
      formatEffectErrors({
        _tag: 'Pointer',
        issue: 'Root issue',
      }),
    ).toEqual([{ field: '', message: 'Root issue' }])
  })

  test('strips stringified path suffixes from object issues', () => {
    expect(
      formatEffectErrors({
        toString: () => 'Expected string\n  at ["email"]',
      }),
    ).toEqual([{ field: '', message: 'Expected string' }])
  })
})
