import { field } from '../src/field.js'
import { anyOf, enabledWhen, fairWhen, requires } from '../src/rules.js'
import { umpire } from '../src/umpire.js'

describe('fairWhen', () => {
  test('marks a present value as fouled without disabling the field', () => {
    const ump = umpire({
      fields: {
        cpu: field<string>()
          .required()
          .isEmpty((value) => !value),
        motherboard: field<string>()
          .required()
          .isEmpty((value) => !value)
          .fairWhen((value, values) => value === values.cpu, {
            reason: 'Motherboard no longer matches the selected CPU',
          }),
        ram: field<string>()
          .required()
          .isEmpty((value) => !value)
          .requires('motherboard', {
            reason: 'Pick a valid motherboard first',
          }),
      },
      rules: [requires('motherboard', 'cpu', { reason: 'Pick a CPU first' })],
    })

    const result = ump.check({
      cpu: 'am5',
      motherboard: 'lga1700',
      ram: 'ddr5-kit',
    })

    expect(result.motherboard).toEqual({
      enabled: true,
      satisfied: true,
      fair: false,
      required: true,
      reason: 'Motherboard no longer matches the selected CPU',
      reasons: ['Motherboard no longer matches the selected CPU'],
    })
    expect(result.ram).toEqual({
      enabled: false,
      satisfied: true,
      fair: true,
      required: false,
      reason: 'Pick a valid motherboard first',
      reasons: ['Pick a valid motherboard first'],
    })
  })

  test('treats empty values as fair and skips the predicate', () => {
    let calls = 0
    const predicate = () => {
      calls += 1
      return false
    }
    const ump = umpire({
      fields: {
        motherboard: {
          isEmpty: (value: unknown) => value == null || value === '',
        },
      },
      rules: [
        fairWhen('motherboard', predicate, {
          reason: 'should not appear',
        }),
      ],
    })

    expect(ump.check({ motherboard: '' }).motherboard).toEqual({
      enabled: true,
      satisfied: false,
      fair: true,
      required: false,
      reason: null,
      reasons: [],
    })
    expect(calls).toBe(0)
  })

  test('fairWhen evaluate always reports enabled: true', () => {
    const rule = fairWhen('motherboard', (value) => value === 'ok', {
      reason: 'invalid motherboard',
    })

    expect(rule.evaluate({}, {}).get('motherboard')).toEqual({
      enabled: true,
      fair: true,
      reason: null,
    })
    expect(rule.evaluate({ motherboard: 'ok' }, {}).get('motherboard')).toEqual(
      {
        enabled: true,
        fair: true,
        reason: null,
      },
    )
  })

  test('play recommends clearing a value when it becomes fouled', () => {
    const ump = umpire({
      fields: {
        cpu: {},
        motherboard: {},
      },
      rules: [
        fairWhen('motherboard', (value, values) => value === values.cpu, {
          reason: 'Motherboard no longer matches the selected CPU',
        }),
      ],
    })

    const fouls = ump.play(
      { values: { cpu: 'am5', motherboard: 'am5' } },
      { values: { cpu: 'lga1700', motherboard: 'am5' } },
    )

    expect(fouls).toEqual([
      {
        field: 'motherboard',
        reason: 'Motherboard no longer matches the selected CPU',
        suggestedValue: undefined,
      },
    ])
  })

  test('challenge reports fair failures and transitive fouled dependencies', () => {
    const ump = umpire({
      fields: {
        cpu: {},
        motherboard: {},
        ram: {},
      },
      rules: [
        fairWhen('motherboard', (value, values) => value === values.cpu, {
          reason: 'Motherboard no longer matches the selected CPU',
        }),
        requires('ram', 'motherboard', {
          reason: 'Pick a valid motherboard first',
        }),
      ],
    })

    const trace = ump.challenge('ram', {
      cpu: 'am5',
      motherboard: 'lga1700',
      ram: 'ddr5-kit',
    })

    expect(trace.enabled).toBe(false)
    expect(trace.fair).toBe(true)
    expect(trace.transitiveDeps).toEqual([
      expect.objectContaining({
        field: 'motherboard',
        enabled: true,
        fair: false,
        reason: 'Motherboard no longer matches the selected CPU',
      }),
    ])

    const motherboardTrace = ump.challenge('motherboard', {
      cpu: 'am5',
      motherboard: 'lga1700',
    })

    expect(motherboardTrace.fair).toBe(false)
    expect(motherboardTrace.directReasons).toEqual([
      expect.objectContaining({
        rule: 'fair',
        passed: false,
        reason: 'Motherboard no longer matches the selected CPU',
      }),
    ])
  })

  test('supports fair OR logic via anyOf()', () => {
    const ump = umpire({
      fields: {
        selection: {},
      },
      rules: [
        anyOf(
          fairWhen('selection', (value) => value === 'alpha', {
            reason: 'Must be alpha',
          }),
          fairWhen('selection', (value) => value === 'omega', {
            reason: 'Must be omega',
          }),
        ),
      ],
    })

    expect(ump.check({ selection: 'omega' }).selection).toEqual({
      enabled: true,
      satisfied: true,
      fair: true,
      required: false,
      reason: null,
      reasons: [],
    })

    expect(ump.check({ selection: 'beta' }).selection).toEqual({
      enabled: true,
      satisfied: true,
      fair: false,
      required: false,
      reason: 'Must be alpha',
      reasons: ['Must be alpha', 'Must be omega'],
    })
  })

  test('rejects mixing fair and availability rules inside anyOf()', () => {
    expect(() =>
      anyOf(
        fairWhen('selection', (value) => value === 'alpha'),
        enabledWhen('selection', () => true),
      ),
    ).toThrow('anyOf() cannot mix fairWhen rules with availability rules')
  })
})

describe('field()', () => {
  test('supports attached enabledWhen rules and default values on builders', () => {
    const ump = umpire<{
      toggle: { default?: boolean }
      details: { default?: string }
    }>({
      fields: {
        toggle: field<boolean>().default(false),
        details: field<string>()
          .default('auto')
          .enabledWhen((values) => values.toggle === true, {
            reason: 'Turn the toggle on first',
          }),
      },
      rules: [],
    })

    expect(ump.init()).toEqual({
      toggle: false,
      details: 'auto',
    })
    expect(
      ump.init({ details: 'manual', missing: 'ignored' } as never),
    ).toEqual({
      toggle: false,
      details: 'manual',
    })
    expect(ump.check({ toggle: false, details: 'manual' }).details).toEqual({
      enabled: false,
      satisfied: true,
      fair: true,
      required: false,
      reason: 'Turn the toggle on first',
      reasons: ['Turn the toggle on first'],
    })
  })

  test('lets named builders target top-level rules', () => {
    const cpu = field<string>('cpu')
      .required()
      .isEmpty((value) => !value)
    const motherboard = field<string>('motherboard')
      .required()
      .isEmpty((value) => !value)

    const ump = umpire({
      fields: {
        cpu,
        motherboard,
      },
      rules: [
        requires(motherboard, 'cpu', { reason: 'Pick a CPU first' }),
        fairWhen(motherboard, (value, values) => value === values.cpu, {
          reason: 'Motherboard no longer matches the selected CPU',
        }),
      ],
    })

    expect(
      ump.check({
        cpu: 'am5',
        motherboard: 'lga1700',
      }).motherboard,
    ).toEqual({
      enabled: true,
      satisfied: true,
      fair: false,
      required: true,
      reason: 'Motherboard no longer matches the selected CPU',
      reasons: ['Motherboard no longer matches the selected CPU'],
    })
  })

  test('supports named builders in attached requires() rules', () => {
    const cpu = field<string>('cpu')
      .required()
      .isEmpty((value) => !value)
    const motherboard = field<string>('motherboard')
      .required()
      .isEmpty((value) => !value)
      .requires(cpu, {
        reason: 'Pick a CPU first',
      })

    const ump = umpire({
      fields: {
        cpu,
        motherboard,
      },
      rules: [],
    })

    expect(ump.check({}).motherboard).toEqual({
      enabled: false,
      satisfied: false,
      fair: true,
      required: false,
      reason: 'Pick a CPU first',
      reasons: ['Pick a CPU first'],
    })
  })

  test('throws when a named builder key does not match its declared name', () => {
    expect(() =>
      umpire({
        fields: {
          board: field<string>('motherboard'),
        },
        rules: [],
      }),
    ).toThrow(
      'Named field builder "motherboard" does not match field key "board"',
    )
  })

  test('throws when an unnamed builder is passed directly to a top-level rule', () => {
    expect(() => requires(field<string>(), 'cpu')).toThrow(
      'Named field builder required when passing a field() value to a rule',
    )
  })

  test('throws when an unnamed builder is used in an attached requires() rule', () => {
    expect(() =>
      field<string>('motherboard').requires(field<string>()),
    ).toThrow(
      'Named field builder required when passing a field() value to a rule',
    )
  })

  test('stores the declared name on named builders only', () => {
    const named = field<string>('cpu')
    const unnamed = field<string>()
    const namedDescriptor = Object.getOwnPropertyDescriptor(named, '__umpfield')

    expect(named.__umpfield).toBe('cpu')
    expect(namedDescriptor?.enumerable).toBe(false)
    expect(namedDescriptor?.writable).toBe(false)
    expect(namedDescriptor?.configurable).toBe(false)
    expect('__umpfield' in unnamed).toBe(false)
    expect((unnamed as { __umpfield?: string }).__umpfield).toBeUndefined()
  })
})
