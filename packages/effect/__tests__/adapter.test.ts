import { enabledWhen, fairWhen, umpire } from '@umpire/core'
import { Schema } from 'effect'
import { createEffectAdapter } from '../src/adapter.js'

const emailSchema = Schema.String.pipe(
  Schema.filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s), {
    message: () => 'Enter a valid email',
  }),
)

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
        password: Schema.String.pipe(
          Schema.filter((s) => s.length >= 8, {
            message: () => 'At least 8 characters',
          }),
        ),
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
        spotType: Schema.Literal('electric', 'standard'),
        vehicleType: Schema.Literal('electric', 'gas'),
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
    expect(foulResult.errors).toMatchObject({
      vehicleType: 'Vehicle type does not match the reserved spot',
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
        base.pipe(
          Schema.filter(
            (data) =>
              (data as Record<string, unknown>).password ===
              (data as Record<string, unknown>).confirmPassword,
            { message: () => 'Passwords do not match' },
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
