import { enabledWhen, fairWhen, umpire } from '@umpire/core'
import { z } from 'zod'
import { createZodAdapter } from '../src/adapter.js'

describe('createZodAdapter', () => {
  test('creates core validators that surface the first Zod issue', () => {
    const validation = createZodAdapter({
      schemas: {
        email: z.string().email('Enter a valid email'),
      },
    })

    const ump = umpire({
      fields: {
        email: { required: true, isEmpty: (value: unknown) => !value },
      },
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

  test('runs derived schema validation and returns filtered field errors', () => {
    const fields = {
      email: { required: true, isEmpty: (value: unknown) => !value },
      password: { required: true, isEmpty: (value: unknown) => !value },
      confirmPassword: { required: true, isEmpty: (value: unknown) => !value },
      companyName: { required: true, isEmpty: (value: unknown) => !value },
    }

    const validation = createZodAdapter({
      schemas: {
        email: z.string().email('Enter a valid email'),
        password: z.string().min(8, 'At least 8 characters'),
        confirmPassword: z.string().min(1, 'Confirm your password'),
        companyName: z.string().min(1, 'Company name is required'),
      },
      build(baseSchema) {
        return baseSchema.refine(
          (data) => data.confirmPassword === data.password,
          { message: 'Passwords do not match', path: ['confirmPassword'] },
        )
      },
    })

    const ump = umpire<typeof fields, { plan: 'personal' | 'business' }>({
      fields,
      rules: [
        enabledWhen(
          'companyName',
          (_values, conditions) => conditions.plan === 'business',
          {
            reason: 'business plan required',
          },
        ),
      ],
    })

    const values = {
      email: 'ok@example.com',
      password: 'password123',
      confirmPassword: 'mismatch',
      companyName: '',
    }
    const availability = ump.check(values, { plan: 'personal' })
    const result = validation.run(availability, values)

    expect(result.schemaFields).toEqual([
      'email',
      'password',
      'confirmPassword',
    ])
    expect(result.errors).toEqual({
      confirmPassword: 'Passwords do not match',
    })
    expect(result.normalizedErrors).toEqual([
      { field: 'confirmPassword', message: 'Passwords do not match' },
    ])
    expect(result.result.success).toBe(false)
  })

  test('can validate nested values from flat dotted field names', () => {
    const fields = {
      'account.accountType': { required: true },
      'account.companyName': { required: true },
      'shipment.hazardous': { required: true },
    }

    const validation = createZodAdapter({
      schemas: {
        'account.accountType': z.enum(['personal', 'business']),
        'account.companyName': z.string().min(1, 'Company name is required'),
        'shipment.hazardous': z.boolean(),
      },
      valueShape: 'nested',
      build() {
        return z.object({
          account: z.object({
            accountType: z.enum(['personal', 'business']),
            companyName: z.string().min(1, 'Company name is required'),
          }),
          shipment: z.object({
            hazardous: z.boolean(),
          }),
        })
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

  test('throws if given a z.object instead of per-field schemas', () => {
    expect(() =>
      createZodAdapter({
        schemas: z.object({
          email: z.string().email(),
        }) as never,
      }),
    ).toThrow(
      'createZodAdapter() expects per-field schemas, not a z.object(). ' +
        'Pass formSchema.shape instead of formSchema.',
    )
  })

  test('throws if given a non-object instead of per-field schemas', () => {
    expect(() =>
      createZodAdapter({
        schemas: undefined as never,
      }),
    ).toThrow('createZodAdapter() expects a per-field schema map object.')
  })

  test('rejects foul field values when rejectFoul is true', () => {
    const fields = {
      spotType: {},
      vehicleType: {},
    }

    const validation = createZodAdapter({
      schemas: {
        spotType: z.enum(['electric', 'standard']),
        vehicleType: z.enum(['electric', 'gas']),
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

    // Electric vehicle in an electric spot — fair, passes
    const fairAvailability = ump.check({
      spotType: 'electric',
      vehicleType: 'electric',
    })
    const fairResult = validation.run(fairAvailability, {
      spotType: 'electric',
      vehicleType: 'electric',
    })
    expect(fairResult.result.success).toBe(true)

    // Gas vehicle in an electric spot — foul, rejected with reason as error
    const foulAvailability = ump.check({
      spotType: 'electric',
      vehicleType: 'gas',
    })
    const foulResult = validation.run(foulAvailability, {
      spotType: 'electric',
      vehicleType: 'gas',
    })
    expect(foulResult.result.success).toBe(false)
    expect(foulResult.errors).toEqual({
      vehicleType: 'Vehicle type does not match the reserved spot',
    })
  })
})
