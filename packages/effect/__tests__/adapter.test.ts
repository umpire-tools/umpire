import { enabledWhen, fairWhen, umpire } from '@umpire/core'
import { Schema } from 'effect'
import { createEffectAdapter } from '../src/adapter.js'

const emailSchema = stringMatching(
  (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s),
  'Enter a valid email',
)

function stringMatching(
  predicate: (value: string) => boolean,
  message: string,
): Schema.Decoder<unknown, never> {
  return Schema.String.check(
    Schema.makeFilter((value) => (predicate(value) ? undefined : message)),
  )
}

describe('createEffectAdapter', () => {
  test('creates per-field validators that surface the first parse error', () => {
    const validation = createEffectAdapter({
      schemas: { email: emailSchema },
    })

    const ump = umpire({
      fields: { email: { required: true } },
      rules: [],
      validators: validation.validators,
    })

    expect(ump.check({ email: 'bad' }).email).toMatchObject({
      valid: false,
      error: 'Enter a valid email',
    })
    expect(ump.check({ email: 'ok@example.com' }).email).toMatchObject({
      valid: true,
    })
  })

  test('per-field validator reports invalid for a type mismatch', () => {
    const validation = createEffectAdapter({
      schemas: { count: Schema.Number },
    })

    const ump = umpire({
      fields: { count: { required: true } },
      rules: [],
      validators: validation.validators,
    })

    expect(ump.check({ count: 'not-a-number' }).count).toMatchObject({
      valid: false,
      error: expect.any(String),
    })
    expect(ump.check({ count: 42 }).count).toMatchObject({ valid: true })
  })

  test('runs derived schema validation and returns filtered field errors', () => {
    const fields = {
      email: { required: true },
      password: { required: true },
      confirmPassword: { required: true },
      companyName: { required: true },
    }

    const validation = createEffectAdapter({
      schemas: {
        email: emailSchema,
        password: stringMatching((s) => s.length >= 8, 'At least 8 characters'),
        confirmPassword: Schema.String,
        companyName: Schema.String,
      },
    })

    const ump = umpire<typeof fields, { plan: 'personal' | 'business' }>({
      fields,
      rules: [
        enabledWhen(
          'companyName',
          (_values, conditions) => conditions.plan === 'business',
          { reason: 'business plan required' },
        ),
      ],
    })

    const values = {
      email: 'ok@example.com',
      password: 'short',
      confirmPassword: 'short',
      companyName: '',
    }
    const availability = ump.check(values, { plan: 'personal' })
    const result = validation.run(availability, values)

    expect(result.schemaFields).not.toContain('companyName')
    expect(result.errors).toMatchObject({ password: 'At least 8 characters' })
    expect(result.result).toMatchObject({ _tag: 'Left' })
  })

  test('can validate nested values from flat dotted field names', () => {
    const fields = {
      'account.accountType': { required: true },
      'account.companyName': { required: true },
      'shipment.hazardous': { required: true },
    }

    const companyNameSchema = stringMatching(
      (s) => s.length > 0,
      'Company name is required',
    )
    const validation = createEffectAdapter({
      schemas: {
        'account.accountType': Schema.Literals(['personal', 'business']),
        'account.companyName': companyNameSchema,
        'shipment.hazardous': Schema.Boolean,
      },
      valueShape: 'nested',
      build() {
        return Schema.Struct({
          account: Schema.Struct({
            accountType: Schema.Literals(['personal', 'business']),
            companyName: companyNameSchema,
          }),
          shipment: Schema.Struct({
            hazardous: Schema.Boolean,
          }),
        }) as Schema.Decoder<unknown, never>
      },
    })

    const ump = umpire({ fields, rules: [] })
    const values = {
      'account.accountType': 'business',
      'account.companyName': '',
      'shipment.hazardous': false,
    }
    const result = validation.run(ump.check(values), values)

    expect(result.errors).toEqual({
      'account.companyName': 'Company name is required',
    })
    expect(result.normalizedErrors).toEqual([
      {
        field: 'account.companyName',
        path: ['account', 'companyName'],
        message: 'Company name is required',
      },
    ])
  })

  test('throws when nested value shape is requested without a composed schema', () => {
    expect(() =>
      createEffectAdapter({
        schemas: {
          'account.companyName': Schema.String,
        },
        valueShape: 'nested',
      }),
    ).toThrow(
      '[@umpire/effect] valueShape: "nested" requires a build() callback because the derived per-field schema uses flat field keys.',
    )
  })

  test('excludes disabled fields from schemaFields', () => {
    const fields = { name: {}, extra: {} }

    const validation = createEffectAdapter({
      schemas: { name: Schema.String, extra: Schema.String },
    })

    const ump = umpire({
      fields,
      rules: [enabledWhen('extra', () => false)],
    })

    const availability = ump.check({ name: 'Alice', extra: 'ignored' })
    const result = validation.run(availability, {
      name: 'Alice',
      extra: 'ignored',
    })

    expect(result.schemaFields).toEqual(['name'])
    expect(result.result).toMatchObject({ _tag: 'Right' })
  })

  test('rejectFoul rejects enabled fields with a foul value', () => {
    const fields = { spotType: {}, vehicleType: {} }

    const validation = createEffectAdapter({
      schemas: {
        spotType: Schema.Literals(['electric', 'standard']),
        vehicleType: Schema.Literals(['electric', 'gas']),
      },
      rejectFoul: true,
    })

    const ump = umpire({
      fields,
      rules: [
        fairWhen(
          'vehicleType',
          (value, values) =>
            value === values.spotType || values.spotType === 'standard',
          { reason: 'Vehicle type does not match the reserved spot' },
        ),
      ],
    })

    const fairAvailability = ump.check({
      spotType: 'electric',
      vehicleType: 'electric',
    })
    expect(
      validation.run(fairAvailability, {
        spotType: 'electric',
        vehicleType: 'electric',
      }).result,
    ).toMatchObject({ _tag: 'Right' })

    const foulAvailability = ump.check({
      spotType: 'electric',
      vehicleType: 'gas',
    })
    const foulResult = validation.run(foulAvailability, {
      spotType: 'electric',
      vehicleType: 'gas',
    })
    expect(foulResult.result).toMatchObject({ _tag: 'Left' })
    expect(foulResult.errors).toEqual({
      vehicleType: 'Vehicle type does not match the reserved spot',
    })
  })

  test('rejectFoul allows absent optional foul fields', () => {
    const fields = { spotType: {}, vehicleType: { required: false } }

    const validation = createEffectAdapter({
      schemas: {
        spotType: Schema.Literals(['electric', 'standard']),
        vehicleType: Schema.Literals(['electric', 'gas']),
      },
      rejectFoul: true,
    })

    const ump = umpire({
      fields,
      rules: [
        fairWhen(
          'vehicleType',
          (value, values) =>
            value === values.spotType || values.spotType === 'standard',
          { reason: 'Vehicle type does not match the reserved spot' },
        ),
      ],
    })

    const availability = ump.check({
      spotType: 'electric',
      vehicleType: undefined,
    })
    const result = validation.run(availability, {
      spotType: 'electric',
      vehicleType: undefined,
    })

    expect(result.result).toMatchObject({ _tag: 'Right' })
    expect(result.errors).toEqual({})
  })

  test('rejectFoul uses the default message when no reason is provided', () => {
    const validation = createEffectAdapter({
      schemas: {
        mode: Schema.Literals(['open', 'locked']),
        choice: Schema.String,
      },
      rejectFoul: true,
    })

    const availability = {
      mode: {
        enabled: true,
        fair: true,
        required: false,
        satisfied: true,
        valid: true,
      },
      choice: {
        enabled: true,
        fair: false,
        required: false,
        satisfied: true,
        valid: true,
      },
    }
    const result = validation.run(availability, {
      mode: 'locked',
      choice: 'stale',
    })

    expect(result.result).toMatchObject({ _tag: 'Left' })
    expect(result.errors).toEqual({
      choice: 'Value is not valid for the current context',
    })
  })

  test('build option allows adding cross-field validation', () => {
    const fields = {
      password: { required: true },
      confirmPassword: { required: true },
    }

    const validation = createEffectAdapter({
      schemas: {
        password: Schema.String,
        confirmPassword: Schema.String,
      },
      build: (base) =>
        base.check(
          Schema.makeFilter((data) =>
            (data as Record<string, unknown>).password ===
            (data as Record<string, unknown>).confirmPassword
              ? undefined
              : 'Passwords do not match',
          ),
        ),
    })

    const ump = umpire({ fields, rules: [] })

    const availability = ump.check({ password: 'abc', confirmPassword: 'xyz' })
    const result = validation.run(availability, {
      password: 'abc',
      confirmPassword: 'xyz',
    })

    expect(result.result).toMatchObject({ _tag: 'Left' })
    expect(result.errors).toEqual({ _root: 'Passwords do not match' })
  })
})
