import { umpire, enabledWhen, normalizeAnyValidationEntry } from '@umpire/async'
import { describe, test, expect, spyOn } from 'bun:test'

describe('async validation', () => {
  test('sync validator returns valid/error', async () => {
    const ump = umpire({
      fields: { name: {} },
      rules: [],
      validators: {
        name: (v: any) =>
          v.length > 0 ? true : { valid: false, error: 'required' },
      },
    })
    const r = await ump.check({ name: '' })
    expect(r.name.valid).toBe(false)
    expect(r.name.error).toBe('required')
    const r2 = await ump.check({ name: 'hello' })
    expect(r2.name.valid).toBe(true)
  })

  test('async validator function', async () => {
    const ump = umpire({
      fields: { email: {} },
      rules: [],
      validators: {
        email: async (v: any) => {
          return v.includes('@')
            ? true
            : { valid: false, error: 'invalid email' }
        },
      },
    })
    const r = await ump.check({ email: 'test@test.com' })
    expect(r.email.valid).toBe(true)
    const r2 = await ump.check({ email: 'bad' })
    expect(r2.email.valid).toBe(false)
  })

  test('safeParseAsync validator', async () => {
    const ump = umpire({
      fields: { email: {} },
      rules: [],
      validators: {
        email: {
          safeParseAsync: async (v: any) => {
            return { success: v.includes('@') }
          },
        },
      },
    })
    const r = await ump.check({ email: 'test@test.com' })
    expect(r.email.valid).toBe(true)
  })

  test('disabled fields skip validation', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [enabledWhen('b', async () => false)],
      validators: {
        b: async (v: any) => ({ valid: false, error: 'bad' }),
      },
    })
    const r = await ump.check({ a: 'x', b: 'value' })
    expect(r.b.enabled).toBe(false)
    expect(r.b.valid).toBeUndefined()
  })

  test('unsatisfied fields skip validation', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [],
      validators: {
        b: async () => ({ valid: false, error: 'bad' }),
      },
    })
    const r = await ump.check({ a: 'x' })
    expect(r.b.satisfied).toBe(false)
    expect(r.b.valid).toBeUndefined()
  })

  test('normalizeAnyValidationEntry handles function', () => {
    const result = normalizeAnyValidationEntry((v: any) => true)
    expect(result).not.toBeNull()
    expect(typeof result!.validate).toBe('function')
  })

  test('normalizeAnyValidationEntry handles safeParseAsync', () => {
    const result = normalizeAnyValidationEntry({
      safeParseAsync: async (v: any) => ({ success: true }),
    })
    expect(result).not.toBeNull()
    expect(typeof result!.validate).toBe('function')
  })

  test('normalizeAnyValidationEntry handles async function', () => {
    const result = normalizeAnyValidationEntry(async (v: any) => true)
    expect(result).not.toBeNull()
    expect(typeof result!.validate).toBe('function')
  })

  test('normalizeAnyValidationEntry returns null for invalid input', () => {
    expect(normalizeAnyValidationEntry(42)).toBeNull()
    expect(normalizeAnyValidationEntry('string')).toBeNull()
  })

  test('normalizeAnyValidationEntry handles safeParse objects', () => {
    const result = normalizeAnyValidationEntry({
      safeParse: (v: any) => ({ success: true }),
    })
    expect(result).not.toBeNull()
  })

  test('normalizeAnyValidationEntry handles test objects', () => {
    const result = normalizeAnyValidationEntry({
      test: (v: string) => v.length > 0,
    })
    expect(result).not.toBeNull()
  })

  test('normalizeAnyValidationEntry handles validator wrapper', () => {
    const result = normalizeAnyValidationEntry({
      validator: (v: string) => v.length > 0,
      error: 'too short',
    })
    expect(result).not.toBeNull()
    expect(result!.error).toBe('too short')
  })

  test('throws for unknown field in validators', () => {
    expect(() =>
      umpire({
        fields: { alpha: {} },
        rules: [],
        validators: {
          beta: (v: any) => true,
        } as never,
      }),
    ).toThrow('Unknown field "beta" referenced by validators')
  })

  test('throws for invalid validator shape', () => {
    expect(() =>
      umpire({
        fields: { alpha: {} },
        rules: [],
        validators: {
          alpha: { validator: { nope: true } },
        } as never,
      }),
    ).toThrow('Invalid validator configured for field "alpha"')
  })

  test('validation metadata mirrored in scorecard', async () => {
    const ump = umpire({
      fields: { email: {} },
      rules: [],
      validators: {
        email: {
          validator: (v: string) => v.includes('@'),
          error: 'Must be a valid email',
        },
      },
    })
    const card = await ump.scorecard({ values: { email: 'bad' } })
    expect(card.fields.email.valid).toBe(false)
    expect(card.fields.email.error).toBe('Must be a valid email')
  })

  test('validator that returns true as boolean', async () => {
    const ump = umpire({
      fields: { name: {} },
      rules: [],
      validators: { name: (v: string) => v.length > 0 },
    })
    const r = await ump.check({ name: 'hello' })
    expect(r.name.valid).toBe(true)
    const r2 = await ump.check({ name: '' })
    expect(r2.name.valid).toBe(false)
    expect(r2.name.error).toBeUndefined()
  })

  test('validator that returns { valid: true/false } with no error', async () => {
    const ump = umpire({
      fields: { x: {} },
      rules: [],
      validators: {
        x: (v: string) => ({ valid: v === 'ok' }),
      },
    })
    const r = await ump.check({ x: 'ok' })
    expect(r.x.valid).toBe(true)
    const r2 = await ump.check({ x: 'nope' })
    expect(r2.x.valid).toBe(false)
  })

  test('warns in dev for unsupported validation result', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const ump = umpire({
        fields: { username: {} },
        rules: [],
        validators: {
          username: (() => undefined) as never,
        },
      })

      await ump.check({ username: 'doug' })
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('unsupported result'),
      )
    } finally {
      warn.mockRestore()
    }
  })

  test('validator that returns false as boolean sets error from fallback', async () => {
    const ump = umpire({
      fields: { x: {} },
      rules: [],
      validators: {
        x: {
          validator: (v: string) => v.length > 0,
          error: 'Fallback error',
        },
      },
    })
    const r = await ump.check({ x: '' })
    expect(r.x.valid).toBe(false)
    expect(r.x.error).toBe('Fallback error')
  })

  test('ignores undefined validator entries', async () => {
    const ump = umpire({
      fields: { a: {}, b: {} },
      rules: [],
      validators: {
        a: undefined,
        b: (v: string) => v.length > 0,
      },
    })
    const r = await ump.check({ a: 'x', b: 'hello' })
    expect(r.a.valid).toBeUndefined()
    expect(r.b.valid).toBe(true)
  })
})
