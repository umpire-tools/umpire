import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { batch, computed, effect, signal } from '@preact/signals-core'
import { enabledWhen, requires, umpire, type Foul } from '@umpire/core'
import { reactiveUmp, type ReactiveUmpire, type SignalProtocol } from '@umpire/signals'
import '../styles/signals-demo.css'

const fields = {
  email:       { required: true, isEmpty: (value: unknown) => !value },
  password:    { required: true, isEmpty: (value: unknown) => !value },
  companyName: { isEmpty: (value: unknown) => !value },
  companySize: { isEmpty: (value: unknown) => !value },
}

type Cond = { plan: 'personal' | 'business' }
type Plan = Cond['plan']
type DemoField = keyof typeof fields
type DemoValues = Record<DemoField, unknown>
type DemoAvailability = {
  enabled: boolean
  required: boolean
  reason: string | null
}
type DemoSnapshot = {
  plan: Plan
  values: DemoValues
  availability: Record<DemoField, DemoAvailability>
  fouls: Foul<typeof fields>[]
  enabledCount: number
}
type DemoStore = {
  reactive: ReactiveUmpire<typeof fields>
  planSignal: { value: Plan }
  snapshot: DemoSnapshot
}

const demoUmp = umpire<typeof fields, Cond>({
  fields,
  rules: [
    // Business-only fields stay behind a condition signal instead of becoming user-owned values.
    enabledWhen('companyName', (_values, conditions) => conditions.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_values, conditions) => conditions.plan === 'business', {
      reason: 'business plan required',
    }),
    // companySize only stays available while companyName is both filled and still enabled.
    requires('companySize', 'companyName'),
  ],
})

const preactAdapter: SignalProtocol = {
  signal(initial) {
    const s = signal(initial)
    return { get: () => s.value, set: (value) => { s.value = value } }
  },
  computed(fn) {
    const c = computed(fn)
    return { get: () => c.value }
  },
  effect,
  batch,
}

const fieldOrder = [
  'email',
  'password',
  'companyName',
  'companySize',
] as const satisfies readonly DemoField[]

const fieldLabels: Record<DemoField, string> = {
  email: 'Email',
  password: 'Password',
  companyName: 'Company Name',
  companySize: 'Company Size',
}

const fieldSamples: Record<DemoField, string> = {
  email: 'crew@stadium.dev',
  password: 'strike-zone',
  companyName: 'Acme Stadium Ops',
  companySize: '100-250 employees',
}

const planOptions = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
] as const

const adapterSnippet = [
  'const preactAdapter: SignalProtocol = {',
  '  signal(initial) {',
  '    const s = signal(initial)',
  '    return { get: () => s.value, set: (value) => { s.value = value } }',
  '  },',
  '  computed(fn) {',
  '    const c = computed(fn)',
  '    return { get: () => c.value }',
  '  },',
  '  effect,',
  '  batch,',
  '}',
].join('\n')

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function JsonBlock({ value }: { value: string }) {
  return (
    <pre className="signals-demo__code-block">
      <code>{value}</code>
    </pre>
  )
}

function createSnapshot(store: Pick<DemoStore, 'reactive' | 'planSignal'>): DemoSnapshot {
  const availability = Object.fromEntries(
    fieldOrder.map((field) => {
      const fieldAvailability = store.reactive.field(field)

      return [
        field,
        {
          enabled: fieldAvailability.enabled,
          required: fieldAvailability.required,
          reason: fieldAvailability.reason,
        },
      ]
    }),
  ) as Record<DemoField, DemoAvailability>

  return {
    plan: store.planSignal.value,
    values: store.reactive.values,
    availability,
    fouls: store.reactive.fouls,
    enabledCount: fieldOrder.filter((field) => availability[field].enabled).length,
  }
}

function createStore(): DemoStore {
  const planSignal = signal<Plan>('personal')
  const reactive = reactiveUmp(demoUmp, preactAdapter, {
    conditions: {
      plan: { get: () => planSignal.value },
    },
  })

  const store = {
    reactive,
    planSignal,
    snapshot: {} as DemoSnapshot,
  }

  store.snapshot = createSnapshot(store)
  return store
}

function subscribeToStore(store: DemoStore, onStoreChange: () => void) {
  let isFirstRun = true

  return effect(() => {
    const nextSnapshot = createSnapshot(store)

    if (isFirstRun) {
      store.snapshot = nextSnapshot
      isFirstRun = false
      return
    }

    store.snapshot = nextSnapshot
    onStoreChange()
  })
}

function useDemoSnapshot(store: DemoStore) {
  return useSyncExternalStore(
    (onStoreChange) => subscribeToStore(store, onStoreChange),
    () => store.snapshot,
    () => store.snapshot,
  )
}

function AvailabilityCard({
  field,
  label,
  availability,
}: {
  field: DemoField
  label: string
  availability: DemoAvailability
}) {
  return (
    <article
      className={cls(
        'signals-demo__field-card',
        !availability.enabled && 'signals-demo__field-card--disabled',
      )}
    >
      <div className="signals-demo__field-top">
        <div>
          <div className="signals-demo__field-name">{label}</div>
          <code className="signals-demo__field-code">{`field('${field}')`}</code>
        </div>

        <div
          className={cls(
            'signals-demo__status',
            availability.enabled
              ? 'signals-demo__status--enabled'
              : 'signals-demo__status--disabled',
          )}
        >
          <span className="signals-demo__status-dot" />
          {availability.enabled ? 'enabled' : 'disabled'}
        </div>
      </div>

      <div className="signals-demo__field-grid">
        <div className="signals-demo__field-cell">
          <span className="signals-demo__field-key">required</span>
          <span
            className={cls(
              'signals-demo__pill',
              availability.required
                ? 'signals-demo__pill--required'
                : 'signals-demo__pill--optional',
            )}
          >
            {String(availability.required)}
          </span>
        </div>

        <div className="signals-demo__field-cell signals-demo__field-cell--reason">
          <span className="signals-demo__field-key">reason</span>
          <span className="signals-demo__field-reason">{availability.reason ?? 'available'}</span>
        </div>
      </div>
    </article>
  )
}

export default function SignalsAdapterDemo() {
  const storeRef = useRef<DemoStore | null>(null)

  if (!storeRef.current) {
    storeRef.current = createStore()
  }

  const store = storeRef.current
  const snapshot = useDemoSnapshot(store)
  const [effectCount, setEffectCount] = useState(0)

  useEffect(() => {
    return subscribeToStore(store, () => {
      setEffectCount((count) => count + 1)
    })
  }, [store])

  useEffect(() => {
    return () => {
      store.reactive.dispose()
    }
  }, [store])

  function setPlan(nextPlan: Plan) {
    store.planSignal.value = nextPlan
  }

  function setFieldValue(field: DemoField) {
    store.reactive.set(field, fieldSamples[field])
  }

  function clearFieldValue(field: DemoField) {
    store.reactive.set(field, '')
  }

  return (
    <div className="signals-demo umpire-demo umpire-demo--styled">
      <div className="umpire-demo__layout">
        <section className="umpire-demo__panel">
          <div className="umpire-demo__panel-header">
            <div>
              <div className="umpire-demo__eyebrow">Signal source of truth</div>
              <h2 className="umpire-demo__title">Signal Controls</h2>
            </div>
            <span className="umpire-demo__panel-accent">@preact/signals-core</span>
          </div>

          <div className="umpire-demo__panel-body">
            <div className="signals-demo__callout">
              <span className="signals-demo__badge">React bridge</span>
              <div>
                <div className="signals-demo__callout-title">Signals stay outside React</div>
                <p className="signals-demo__callout-text">
                  `reactiveUmp()` owns the field signals, while React listens through
                  `useSyncExternalStore()` for availability and foul updates.
                </p>
              </div>
            </div>

            <div className="signals-demo__controls">
              <div className="signals-demo__control-group">
                <div className="signals-demo__control-label">Plan Conditions</div>
                <div className="umpire-demo__plan-toggle" aria-label="Plan">
                  {planOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={snapshot.plan === option.value}
                      className={cls(
                        'umpire-demo__plan-option',
                        snapshot.plan === option.value && 'umpire-demo__plan-option--active',
                      )}
                      onClick={() => setPlan(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {fieldOrder.map((field) => (
                <div key={field} className="signals-demo__control-group">
                  <div className="signals-demo__control-label">{fieldLabels[field]}</div>
                  <div className="signals-demo__button-row">
                    <button
                      type="button"
                      className="signals-demo__button"
                      onClick={() => setFieldValue(field)}
                    >
                      Set {fieldLabels[field].toLowerCase()}
                    </button>
                    <button
                      type="button"
                      className="signals-demo__button signals-demo__button--ghost"
                      onClick={() => clearFieldValue(field)}
                    >
                      Clear {fieldLabels[field].toLowerCase()}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <section className="signals-demo__json-shell">
              <div className="signals-demo__json-header">
                <span className="signals-demo__json-title">signal snapshot</span>
                <span className="signals-demo__json-meta">{snapshot.plan} plan</span>
              </div>
              <JsonBlock value={prettyJson({ conditions: { plan: snapshot.plan }, values: snapshot.values })} />
            </section>

            <section className="signals-demo__json-shell">
              <div className="signals-demo__json-header">
                <span className="signals-demo__json-title">inline adapter</span>
                <span className="signals-demo__json-meta">SignalProtocol</span>
              </div>
              <JsonBlock value={adapterSnippet} />
            </section>
          </div>
        </section>

        <section className="umpire-demo__panel">
          <div className="umpire-demo__panel-header">
            <div>
              <div className="umpire-demo__eyebrow">React subscription output</div>
              <h2 className="umpire-demo__title">Umpire Availability</h2>
            </div>
            <div className="signals-demo__counter">
              <span className="signals-demo__counter-label">effect()</span>
              <span className="signals-demo__counter-value">{effectCount}</span>
            </div>
          </div>

          <div className="umpire-demo__panel-body">
            <div className="signals-demo__summary">
              <div className="signals-demo__summary-card">
                <div className="signals-demo__summary-label">Adapter</div>
                <code className="signals-demo__summary-code">reactiveUmp(demoUmp, preactAdapter, …)</code>
              </div>
              <div className="signals-demo__summary-card">
                <div className="signals-demo__summary-label">Bridge</div>
                <code className="signals-demo__summary-code">useSyncExternalStore(subscribe, getSnapshot)</code>
              </div>
              <div className="signals-demo__summary-card">
                <div className="signals-demo__summary-label">Enabled</div>
                <div className="signals-demo__summary-value">
                  {snapshot.enabledCount}
                  <span className="signals-demo__summary-total"> / {fieldOrder.length}</span>
                </div>
              </div>
            </div>

            <div className="signals-demo__field-list">
              {fieldOrder.map((field) => (
                <AvailabilityCard
                  key={field}
                  field={field}
                  label={fieldLabels[field]}
                  availability={snapshot.availability[field]}
                />
              ))}
            </div>

            <section
              className={cls(
                'signals-demo__fouls',
                snapshot.fouls.length > 0 && 'signals-demo__fouls--alert',
              )}
            >
              <div className="signals-demo__json-header">
                <span className="signals-demo__json-title">fouls</span>
                <span className="signals-demo__json-meta">
                  {snapshot.fouls.length > 0 ? 'effect()-driven transitions' : '[]'}
                </span>
              </div>
              <JsonBlock value={snapshot.fouls.length > 0 ? prettyJson(snapshot.fouls) : '[]'} />
            </section>

            <p className="signals-demo__note">
              Set both company fields on the business plan, then switch back to personal to watch
              the adapter flag reset fouls from signal-driven before and after snapshots.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
