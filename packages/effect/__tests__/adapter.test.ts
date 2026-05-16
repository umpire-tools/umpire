import { enabledWhen, fairWhen, umpire } from '@umpire/core'
import { Context, Effect, Layer, Schema } from 'effect'
import { createEffectAdapter } from '../src/adapter.js'
import { UmpireValidationError } from '../src/errors.js'

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
  test('supports the public uncurried factory call', () => {
    const validation = createEffectAdapter({
      schemas: { email: emailSchema },
    })

    expect(typeof validation.run).toBe('function')
    expect(typeof validation.validators.email).toBe('function')
  })

  test('creates per-field validators that surface the first parse error', () => {
    const validation = createEffectAdapter()({
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
    const validation = createEffectAdapter()({
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

    const validation = createEffectAdapter()({
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
    const validation = createEffectAdapter()({
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
      createEffectAdapter()({
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

    const validation = createEffectAdapter()({
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

    const validation = createEffectAdapter()({
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

    const validation = createEffectAdapter()({
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
    const validation = createEffectAdapter()({
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

    const validation = createEffectAdapter()({
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

  test('runEffect returns the same result shape as run()', async () => {
    const validation = createEffectAdapter()({
      schemas: { email: emailSchema },
    })
    const ump = umpire({
      fields: { email: { required: true } },
      rules: [],
      validators: validation.validators,
    })
    const availability = ump.check({ email: 'bad' })
    const values = { email: 'bad' }

    const syncResult = validation.run(availability, values)
    const effectResult = await Effect.runPromise(
      validation.runEffect(availability, values),
    )

    expect(effectResult.errors).toEqual(syncResult.errors)
    expect(effectResult.normalizedErrors).toEqual(syncResult.normalizedErrors)
    expect(effectResult.result).toEqual(syncResult.result)
    expect(effectResult.schemaFields).toEqual(syncResult.schemaFields)
  })

  test('runEffect returns a successful decode result with schema fields', async () => {
    const validation = createEffectAdapter()({
      schemas: {
        email: emailSchema,
        name: Schema.String,
      },
    })
    const ump = umpire({
      fields: { email: { required: true }, name: {} },
      rules: [],
      validators: validation.validators,
    })
    const availability = ump.check({
      email: 'ok@example.com',
      name: 'Alice',
    })

    const result = await Effect.runPromise(
      validation.runEffect(availability, {
        email: 'ok@example.com',
        name: 'Alice',
      }),
    )

    expect(result.result._tag).toBe('Right')
    expect(result.schemaFields).toEqual(['email', 'name'])
  })

  test('runValidate returns the decoded value on success (not the decode wrapper)', async () => {
    const validation = createEffectAdapter()({
      schemas: { name: Schema.String },
    })
    const ump = umpire({
      fields: { name: { required: true } },
      rules: [],
      validators: validation.validators,
    })
    const availability = ump.check({ name: 'Alice' })

    const result = await Effect.runPromise(
      validation.runValidate(availability, { name: 'Alice' }),
    )

    expect(result).toEqual({ name: 'Alice' })
  })

  test('runValidate returns the transformed/decoded value for coercing schemas', async () => {
    const validation = createEffectAdapter()({
      schemas: { age: Schema.NumberFromString },
    })
    const ump = umpire({
      fields: { age: { required: true } },
      rules: [],
      validators: validation.validators,
    })
    const availability = ump.check({ age: '42' })

    const result = await Effect.runPromise(
      validation.runValidate<{ age: number }>(availability, { age: '42' }),
    )

    // Schema.NumberFromString coerces string "42" to number 42
    expect(result).toEqual({ age: 42 })
    expect(typeof result.age).toBe('number')
  })

  test('runEffect supports nested valueShape pipelines', async () => {
    const validation = createEffectAdapter()({
      schemas: {
        'account.companyName': Schema.String,
      },
      valueShape: 'nested',
      build: () =>
        Schema.Struct({
          account: Schema.Struct({
            companyName: stringMatching(
              (value) => value.length > 0,
              'Company name is required',
            ),
          }),
        }),
    })
    const availability = {
      'account.companyName': {
        enabled: true,
        fair: true,
        required: true,
        satisfied: false,
        valid: true,
      },
    }

    const result = await Effect.runPromise(
      validation.runEffect(availability, {
        'account.companyName': '',
      }),
    )

    expect(result.result._tag).toBe('Left')
    expect(result.errors).toEqual({
      'account.companyName': 'Company name is required',
    })
  })

  test('runValidate supports nested valueShape pipelines', async () => {
    const validation = createEffectAdapter()({
      schemas: {
        'account.age': Schema.NumberFromString,
      },
      valueShape: 'nested',
      build: () =>
        Schema.Struct({
          account: Schema.Struct({
            age: Schema.NumberFromString,
          }),
        }),
    })
    const availability = {
      'account.age': {
        enabled: true,
        fair: true,
        required: true,
        satisfied: true,
        valid: true,
      },
    }

    const decoded = await Effect.runPromise(
      validation.runValidate(availability, { 'account.age': '42' }),
    )

    expect(decoded).toEqual({ account: { age: 42 } })
  })

  test('runValidate fails with UmpireValidationError on validation errors', async () => {
    const validation = createEffectAdapter()({
      schemas: { email: emailSchema },
    })
    const ump = umpire({
      fields: { email: { required: true } },
      rules: [],
      validators: validation.validators,
    })
    const availability = ump.check({ email: 'bad' })

    const error = await Effect.runPromise(
      Effect.flip(validation.runValidate(availability, { email: 'bad' })),
    )

    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe('UmpireValidationError')
    expect(error.errors).toEqual({ email: 'Enter a valid email' })
    expect(error.normalizedErrors).toEqual([
      { field: 'email', message: 'Enter a valid email' },
    ])
    expect(error.message).toBe('Validation failed: email')
  })

  test('UmpireValidationError message ignores undefined error entries', () => {
    const error = new UmpireValidationError({
      errors: {
        email: undefined,
        name: 'Name is required',
      },
      normalizedErrors: [],
    })

    expect(error.message).toBe('Validation failed: name')
  })

  test('UmpireValidationError falls back to generic message for empty errors', () => {
    const error = new UmpireValidationError({
      errors: {},
      normalizedErrors: [],
    })

    expect(error.message).toBe('Validation failed')
  })

  test('UmpireValidationError falls back to generic message when all entries are undefined', () => {
    const error = new UmpireValidationError({
      errors: {
        email: undefined,
      },
      normalizedErrors: [],
    })

    expect(error.message).toBe('Validation failed')
  })

  test('runValidate rejects foul values when rejectFoul is enabled', async () => {
    const fields = { spotType: {}, vehicleType: {} }
    const validation = createEffectAdapter()({
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
      vehicleType: 'gas',
    })

    const error = await Effect.runPromise(
      Effect.flip(
        validation.runValidate(availability, {
          spotType: 'electric',
          vehicleType: 'gas',
        }),
      ),
    )

    expect(error).toBeInstanceOf(UmpireValidationError)
    expect(error.errors).toEqual({
      vehicleType: 'Vehicle type does not match the reserved spot',
    })
    expect(error.normalizedErrors).toEqual([
      {
        field: 'vehicleType',
        message: 'Vehicle type does not match the reserved spot',
      },
    ])
    expect(error.message).toBe('Validation failed: vehicleType')
  })

  test('can catch UmpireValidationError with Effect.catchTag', async () => {
    const validation = createEffectAdapter()({
      schemas: { email: emailSchema },
    })
    const ump = umpire({
      fields: { email: { required: true } },
      rules: [],
      validators: validation.validators,
    })
    const availability = ump.check({ email: 'bad' })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* validation.runValidate(availability, { email: 'bad' })
        return 'success'
      }).pipe(
        Effect.catchTag('UmpireValidationError', (error) =>
          Effect.succeed(`caught: ${error.errors.email}`),
        ),
      ),
    )

    expect(result).toBe('caught: Enter a valid email')
  })

  test('runValidate works with a serviceful Effect Schema when the service is provided', async () => {
    const ParseService = Context.Service<{ parse: (s: string) => number }>(
      'ParseService',
    )

    const servicefulSchema: Schema.Decoder<
      number,
      { parse: (s: string) => number }
    > = Schema.declareConstructor()(
      [],
      () => (input: unknown, _ast: never) =>
        Effect.gen(function* () {
          const _svc = yield* Effect.service(ParseService)
          if (typeof input === 'string') {
            const n = Number(input)
            if (isNaN(n)) {
              return yield* Effect.fail(
                new Schema.SchemaError('not a number' as never),
              )
            }
            return n
          }
          return yield* Effect.fail(
            new Schema.SchemaError('not a string' as never),
          )
        }),
    )

    const validation = createEffectAdapter()({
      schemas: { value: servicefulSchema },
    })

    const availability = {
      value: {
        enabled: true,
        fair: true,
        required: true,
        satisfied: true,
        valid: true,
      },
    }

    const result = await Effect.runPromise(
      Effect.provide(
        validation.runValidate(availability, { value: '42' }),
        Layer.succeed(ParseService, { parse: (s: string) => Number(s) }),
      ),
    )

    expect(result).toEqual({ value: 42 })
  })

  test('runEffect works with a serviceful Effect Schema when the service is provided', async () => {
    const ParseService = Context.Service<{ parse: (s: string) => number }>(
      'ParseService',
    )

    const servicefulSchema: Schema.Decoder<
      number,
      { parse: (s: string) => number }
    > = Schema.declareConstructor()(
      [],
      () => (input: unknown, _ast: never) =>
        Effect.gen(function* () {
          const _svc = yield* Effect.service(ParseService)
          if (typeof input === 'string') {
            const n = Number(input)
            if (isNaN(n)) {
              return yield* Effect.fail(
                new Schema.SchemaError('not a number' as never),
              )
            }
            return n
          }
          return yield* Effect.fail(
            new Schema.SchemaError('not a string' as never),
          )
        }),
    )

    const validation = createEffectAdapter()({
      schemas: { value: servicefulSchema },
    })

    const availability = {
      value: {
        enabled: true,
        fair: true,
        required: true,
        satisfied: true,
        valid: true,
      },
    }

    const result = await Effect.runPromise(
      Effect.provide(
        validation.runEffect(availability, { value: '42' }),
        Layer.succeed(ParseService, { parse: (s: string) => Number(s) }),
      ),
    )

    expect(result.result._tag).toBe('Right')
    if (result.result._tag === 'Right') {
      expect(result.result.value).toEqual({ value: 42 })
    }
  })

  test('serviceful schema parse failure maps to UmpireValidationError', async () => {
    const ParseService = Context.Service<{ parse: (s: string) => number }>(
      'ParseService',
    )

    const servicefulSchema: Schema.Decoder<
      number,
      { parse: (s: string) => number }
    > = Schema.declareConstructor()(
      [],
      () => (input: unknown, _ast: never) =>
        Effect.gen(function* () {
          const _svc = yield* Effect.service(ParseService)
          if (typeof input === 'string') {
            const n = Number(input)
            if (isNaN(n)) {
              return yield* Effect.fail(
                new Schema.SchemaError('not a number' as never),
              )
            }
            return n
          }
          return yield* Effect.fail(
            new Schema.SchemaError('not a string' as never),
          )
        }),
    )

    const validation = createEffectAdapter()({
      schemas: { value: servicefulSchema },
    })

    const availability = {
      value: {
        enabled: true,
        fair: true,
        required: true,
        satisfied: true,
        valid: true,
      },
    }

    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          validation.runValidate(availability, { value: 'not-a-number' }),
          Layer.succeed(ParseService, { parse: (s: string) => Number(s) }),
        ),
      ),
    )

    expect(error._tag).toBe('UmpireValidationError')
  })
})
