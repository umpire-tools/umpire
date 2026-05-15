import { Effect, Schema } from 'effect'
import {
  decodeEffectSchema,
  decodeEffectSchemaSync,
  isDecodeFailure,
  isDecodeSuccess,
} from '../src/index.js'
import { formatEffectErrors } from '../src/effect-schema.js'

describe('decode helpers', () => {
  test('decodeEffectSchema returns an Effect decode result', async () => {
    const result = await Effect.runPromise(
      decodeEffectSchema(Schema.NumberFromString, '42'),
    )

    expect(result).toEqual({ _tag: 'Right', value: 42 })
    expect(isDecodeSuccess(result)).toBe(true)
    expect(isDecodeFailure(result)).toBe(false)
  })

  test('decodeEffectSchema returns parse issues as a failed decode result', async () => {
    const result = await Effect.runPromise(
      decodeEffectSchema(Schema.Number, 'not-a-number'),
    )

    expect(result._tag).toBe('Left')
    expect(isDecodeFailure(result)).toBe(true)
    expect(isDecodeSuccess(result)).toBe(false)
    expect(formatEffectErrors(result.error)[0]?.message).toContain('number')
  })

  test('decodeEffectSchemaSync returns a plain decode result', () => {
    const result = decodeEffectSchemaSync(Schema.NumberFromString, '42')

    expect(result).toEqual({ _tag: 'Right', value: 42 })
  })

  test('decodeEffectSchemaSync returns parse issues as a failed decode result', () => {
    const result = decodeEffectSchemaSync(Schema.Number, 'not-a-number')

    expect(result._tag).toBe('Left')
    expect(formatEffectErrors(result.error)[0]?.message).toContain('number')
  })
})

describe('formatEffectErrors', () => {
  test('formats real Effect schema decode failures', () => {
    const emailSchema = Schema.Struct({
      email: Schema.String.check(
        Schema.makeFilter((value) =>
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
            ? undefined
            : 'Enter a valid email',
        ),
      ),
    })

    const result = Schema.decodeUnknownResult(emailSchema)({
      email: 'not-an-email',
    })

    expect(result._tag).toBe('Failure')
    const errors = formatEffectErrors(result.failure)
    expect(errors).toEqual([{ field: 'email', message: 'Enter a valid email' }])
  })

  test('flattens real multi-field composite decode failures', () => {
    const signupSchema = Schema.Struct({
      email: Schema.String.check(
        Schema.makeFilter((value) =>
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
            ? undefined
            : 'Enter a valid email',
        ),
      ),
      password: Schema.String.check(
        Schema.makeFilter((value) =>
          value.length >= 8 ? undefined : 'At least 8 characters',
        ),
      ),
    })

    const result = Schema.decodeUnknownResult(signupSchema)(
      { email: 'bad', password: 'short' },
      { errors: 'all' },
    )

    expect(result._tag).toBe('Failure')
    const errors = formatEffectErrors(result.failure)
    expect(errors).toEqual([
      { field: 'email', message: 'Enter a valid email' },
      { field: 'password', message: 'At least 8 characters' },
    ])
  })

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

  test('flattens composite issues from multiple fields', () => {
    expect(
      formatEffectErrors({
        _tag: 'Composite',
        issues: [
          {
            _tag: 'Pointer',
            path: ['email'],
            issue: 'Enter a valid email',
          },
          {
            _tag: 'Pointer',
            path: ['password'],
            issue: 'At least 8 characters',
          },
        ],
      }),
    ).toEqual([
      { field: 'email', message: 'Enter a valid email' },
      { field: 'password', message: 'At least 8 characters' },
    ])
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
