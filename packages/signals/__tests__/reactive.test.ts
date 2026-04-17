import { describe, expect, it, spyOn, test } from 'bun:test'
import { umpire, enabledWhen, requires, disables } from '@umpire/core'
import type { FieldDef } from '@umpire/core'
import type { SignalProtocol } from '../src/protocol.js'
import { reactiveUmp } from '../src/reactive.js'

// ---------------------------------------------------------------------------
// Mock signal adapter — synchronous, eager re-evaluation
// ---------------------------------------------------------------------------

type Subscriber = () => void

interface MockSignal<T> {
  get(): T
  set(value: T): void
  _value: T
  _subs: Set<Subscriber>
}

interface MockComputed<T> {
  get(): T
  _fn: () => T
  _value: T
}

function createMockAdapter(): SignalProtocol & {
  _flush(): void
  _effects: Array<{ fn: () => void | (() => void); dispose: () => void }>
} {
  const signals: MockSignal<unknown>[] = []
  const computeds: MockComputed<unknown>[] = []
  const effects: Array<{
    fn: () => void | (() => void)
    cleanup: (() => void) | void
    dispose: () => void
    disposed: boolean
  }> = []

  // Track which signal is being read during computed/effect evaluation
  let activeSubscribers: Set<Subscriber> | null = null

  function recompute() {
    // Re-evaluate all computeds
    for (const c of computeds) {
      c._value = c._fn()
    }
    // Run all effects
    for (const e of effects) {
      if (e.disposed) continue
      if (e.cleanup) e.cleanup()
      e.cleanup = e.fn() ?? undefined
    }
  }

  const adapter: SignalProtocol & {
    _flush(): void
    _effects: typeof effects
  } = {
    signal<T>(initial: T) {
      const s: MockSignal<T> = {
        _value: initial,
        _subs: new Set(),
        get() {
          if (activeSubscribers) {
            // Register dependency — not used in this simple mock
          }
          return s._value
        },
        set(value: T) {
          s._value = value
          // In the mock adapter, we don't auto-trigger.
          // Consumer calls _flush() to trigger recomputation.
        },
      }
      signals.push(s as MockSignal<unknown>)
      return s
    },

    computed<T>(fn: () => T) {
      const c: MockComputed<T> = {
        _fn: fn,
        _value: fn(), // eager initial evaluation
        get() {
          // Always re-evaluate in the mock (simple but correct)
          c._value = c._fn()
          return c._value
        },
      }
      computeds.push(c as MockComputed<unknown>)
      return c
    },

    effect(fn) {
      const entry = {
        fn,
        cleanup: undefined as (() => void) | void,
        dispose() {
          entry.disposed = true
          if (entry.cleanup) entry.cleanup()
        },
        disposed: false,
      }
      // Run immediately
      entry.cleanup = fn() ?? undefined
      effects.push(entry)
      return () => entry.dispose()
    },

    batch(fn) {
      fn()
    },

    _flush() {
      recompute()
    },

    _effects: effects,
  }

  return adapter
}

// ---------------------------------------------------------------------------
// Test umpire setup — simple form with interdependent fields
// ---------------------------------------------------------------------------

function createTestUmpire() {
  return umpire({
    fields: {
      email: { required: true, isEmpty: (v) => !v },
      password: { required: true, isEmpty: (v) => !v },
      confirmPassword: { required: true, isEmpty: (v) => !v },
      companyName: {},
      companySize: {},
    },
    rules: [
      requires('confirmPassword', 'password'),
      enabledWhen('companyName', (_v, ctx) => ctx.plan === 'business'),
      enabledWhen('companySize', (_v, ctx) => ctx.plan === 'business'),
      requires('companySize', 'companyName'),
    ],
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reactiveUmp', () => {
  test('creates and returns the correct API shape', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter)

    expect(typeof reactive.field).toBe('function')
    expect(typeof reactive.set).toBe('function')
    expect(typeof reactive.update).toBe('function')
    expect(typeof reactive.dispose).toBe('function')
    expect(reactive.values).toBeDefined()
    // fouls should be available when adapter has effect
    expect(reactive.fouls).toBeDefined()
  })

  test('field(name) returns correct availability properties', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter, {
      conditions: { plan: { get: () => 'personal' } },
    })

    const email = reactive.field('email')
    expect(email.enabled).toBe(true)
    expect(email.satisfied).toBe(false)
    expect(email.fair).toBe(true)
    expect(email.required).toBe(true)
    expect(email.reason).toBeNull()
    expect(email.reasons).toEqual([])
  })

  test('field(name).enabled reflects check() result', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter, {
      conditions: { plan: { get: () => 'personal' } },
    })

    // Company fields should be disabled for personal plan
    expect(reactive.field('companyName').enabled).toBe(false)
    expect(reactive.field('companySize').enabled).toBe(false)

    // Email should be enabled
    expect(reactive.field('email').enabled).toBe(true)

    expect(reactive.field('email').satisfied).toBe(false)

    reactive.set('email', 'test@example.com')

    expect(reactive.field('email').satisfied).toBe(true)
  })

  test('field(name) returns the same object on repeated calls', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter)

    const field1 = reactive.field('email')
    const field2 = reactive.field('email')
    expect(field1).toBe(field2)
  })

  test('field(name) throws for unknown field', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter)

    expect(() => reactive.field('nonexistent' as never)).toThrow('Unknown field')
  })

  test('set(name, value) updates the field signal and recomputes availability', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter)

    // confirmPassword requires password — initially disabled (no password)
    expect(reactive.field('confirmPassword').enabled).toBe(false)

    // Set password
    reactive.set('password', 'hunter2')

    // Now confirmPassword should be enabled (mock computed re-evaluates on get)
    expect(reactive.field('confirmPassword').enabled).toBe(true)
  })

  test('set(name, value) throws for unknown field', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter)

    expect(() => reactive.set('nonexistent' as never, 'value')).toThrow(
      'Unknown field',
    )
  })

  test('update(partial) batch-updates multiple fields', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter)

    reactive.update({ email: 'test@test.com', password: 'hunter2' })

    const values = reactive.values
    expect(values.email).toBe('test@test.com')
    expect(values.password).toBe('hunter2')
  })

  test('update(partial) falls back to direct updates when batch is unavailable', () => {
    const adapter = createMockAdapter()
    const noBatchAdapter: SignalProtocol = {
      signal: adapter.signal.bind(adapter),
      computed: adapter.computed.bind(adapter),
      effect: adapter.effect?.bind(adapter),
    }

    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, noBatchAdapter)

    reactive.update({
      email: 'fallback@test.com',
      password: 'hunter2',
    })

    expect(reactive.values.email).toBe('fallback@test.com')
    expect(reactive.values.password).toBe('hunter2')
  })

  test('values returns current field values', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter)

    // All fields should have init() defaults (undefined)
    const values = reactive.values
    expect(values).toHaveProperty('email')
    expect(values).toHaveProperty('password')
    expect(values).toHaveProperty('confirmPassword')
    expect(values).toHaveProperty('companyName')
    expect(values).toHaveProperty('companySize')
  })

  test('values reflects set() changes', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter)

    reactive.set('email', 'alice@example.com')
    expect(reactive.values.email).toBe('alice@example.com')
  })

  test('condition signals feed conditions to check()', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()

    let plan = 'personal'
    const reactive = reactiveUmp(ump, adapter, {
      conditions: { plan: { get: () => plan } },
    })

    // Personal plan — company fields disabled
    expect(reactive.field('companyName').enabled).toBe(false)

    // Switch to business plan
    plan = 'business'

    // Mock computed re-evaluates on get()
    expect(reactive.field('companyName').enabled).toBe(true)
  })

  test('predicates can enumerate and inspect value and condition proxies', () => {
    type Conditions = { plan: string }

    const adapter = createMockAdapter()
    const ump = umpire<Record<'source' | 'target', FieldDef>, Conditions>({
      fields: {
        source: {},
        target: {},
      },
      rules: [
        enabledWhen('target', (values, conditions) => {
          const valueDescriptor = Object.getOwnPropertyDescriptor(
            values as object,
            'source',
          )
          const conditionDescriptor = Object.getOwnPropertyDescriptor(
            conditions as object,
            'plan',
          )

          return (
            'source' in values &&
            'plan' in conditions &&
            !Reflect.has(values as object, Symbol.iterator) &&
            !Reflect.has(conditions as object, Symbol.iterator) &&
            Object.keys(values).includes('source') &&
            Object.keys(conditions).includes('plan') &&
            valueDescriptor?.enumerable === true &&
            conditionDescriptor?.enumerable === true &&
            Object.getOwnPropertyDescriptor(values as object, Symbol.iterator) ===
              undefined &&
            Object.getOwnPropertyDescriptor(
              conditions as object,
              Symbol.iterator,
            ) === undefined
          )
        }),
      ],
    })

    const reactive = reactiveUmp(ump, adapter, {
      conditions: { plan: { get: () => 'business' } },
    })

    expect(reactive.field('target').enabled).toBe(true)
  })

  test('external signals are used when provided', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()

    let emailValue: unknown = 'external@test.com'
    const externalEmail = {
      get: () => emailValue,
      set: (v: unknown) => {
        emailValue = v
      },
    }

    const reactive = reactiveUmp(ump, adapter, {
      signals: { email: externalEmail },
    })

    // Should use the external signal's value
    expect(reactive.values.email).toBe('external@test.com')

    // Setting through reactive should call the external signal's set
    reactive.set('email', 'updated@test.com')
    expect(emailValue).toBe('updated@test.com')
  })

  test('dispose() cleans up effects', () => {
    const adapter = createMockAdapter()
    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, adapter)

    // Should have created effects for fouls tracking
    expect(adapter._effects.length).toBeGreaterThan(0)

    reactive.dispose()

    // After dispose, effects should be marked as disposed
    for (const e of adapter._effects) {
      expect(e.disposed).toBe(true)
    }
  })
})

describe('reactiveUmp without effect', () => {
  test('logs a warning when adapter has no effect', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    const adapter = createMockAdapter()
    // Remove effect to simulate TC39 adapter
    const noEffectAdapter: SignalProtocol = {
      signal: adapter.signal.bind(adapter),
      computed: adapter.computed.bind(adapter),
      batch: adapter.batch?.bind(adapter),
    }

    const ump = createTestUmpire()
    reactiveUmp(ump, noEffectAdapter)

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('does not provide effect()'),
    )

    warn.mockRestore()
  })

  test('fouls throws when adapter has no effect', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    const adapter = createMockAdapter()
    const noEffectAdapter: SignalProtocol = {
      signal: adapter.signal.bind(adapter),
      computed: adapter.computed.bind(adapter),
    }

    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, noEffectAdapter)

    expect(() => reactive.foul('email')).toThrow('foul() is unavailable')
    expect(() => reactive.fouls).toThrow('fouls is unavailable')

    warn.mockRestore()
  })

  test('field availability still works without effect', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    const adapter = createMockAdapter()
    const noEffectAdapter: SignalProtocol = {
      signal: adapter.signal.bind(adapter),
      computed: adapter.computed.bind(adapter),
    }

    const ump = createTestUmpire()
    const reactive = reactiveUmp(ump, noEffectAdapter)

    expect(reactive.field('email').enabled).toBe(true)
    expect(reactive.field('confirmPassword').enabled).toBe(false)

    reactive.set('password', 'test')
    expect(reactive.field('confirmPassword').enabled).toBe(true)

    warn.mockRestore()
  })
})

describe('reactiveUmp with disables rules', () => {
  test('fouls returns reset recommendations when fields become disabled', () => {
    const adapter = createMockAdapter()

    const ump = umpire({
      fields: {
        isAllDay: { default: false, isEmpty: (v) => !v },
        startTime: { default: undefined, isEmpty: (v) => !v },
        endTime: { default: undefined, isEmpty: (v) => !v },
      },
      rules: [
        disables(
          'isAllDay',
          ['startTime', 'endTime'],
          { reason: 'All-day events do not have specific times' },
        ),
      ],
    })

    const reactive = reactiveUmp(ump, adapter)

    // Set values so fields have content
    reactive.set('startTime', '09:00')
    reactive.set('endTime', '10:00')

    // Flush to run the effect — this advances the prev snapshot
    // so it captures the state with startTime/endTime set
    adapter._flush()

    // Now enable isAllDay — should disable startTime/endTime
    reactive.set('isAllDay', true)

    // Flush to run the effect again — captures the transition
    adapter._flush()

    // Fouls should recommend resetting startTime and endTime
    const fouls = reactive.fouls
    expect(fouls.length).toBe(2)

    const fields = fouls.map((p) => p.field).sort()
    expect(fields).toEqual(['endTime', 'startTime'])
    expect(reactive.foul('startTime')?.field).toBe('startTime')
  })

  test('fouls converges to empty after consumer applies resets', () => {
    const adapter = createMockAdapter()

    const ump = umpire({
      fields: {
        isAllDay: { default: false, isEmpty: (v) => !v },
        startTime: { default: undefined, isEmpty: (v) => !v },
      },
      rules: [
        disables(
          'isAllDay',
          ['startTime'],
          { reason: 'All-day events do not have specific times' },
        ),
      ],
    })

    const reactive = reactiveUmp(ump, adapter)

    // Set startTime
    reactive.set('startTime', '09:00')
    adapter._flush()

    // Disable startTime by setting isAllDay
    reactive.set('isAllDay', true)
    adapter._flush()

    expect(reactive.fouls.length).toBe(1)

    // Consumer applies the reset
    reactive.set('startTime', undefined)
    adapter._flush()

    // After clearing the value, the foul should disappear
    expect(reactive.fouls.length).toBe(0)
  })

  test('fouls snapshots nested object values before in-place mutations', () => {
    const adapter = createMockAdapter()
    const sharedSettings = { allowNote: true }

    const ump = umpire({
      fields: {
        settings: {},
        note: { default: '' },
      },
      rules: [
        enabledWhen('note', (values) => {
          return (values.settings as { allowNote: boolean } | undefined)?.allowNote === true
        }),
      ],
    })

    const reactive = reactiveUmp(ump, adapter)

    reactive.set('settings', sharedSettings)
    reactive.set('note', 'keep me')
    adapter._flush()

    sharedSettings.allowNote = false
    reactive.set('settings', sharedSettings)
    adapter._flush()

    expect(reactive.field('note').enabled).toBe(false)
    expect(reactive.fouls.some((foul) => foul.field === 'note')).toBe(true)
  })
})
