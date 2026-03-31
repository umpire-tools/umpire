import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { fromStore, type UmpireStore } from '@umpire/zustand'

const fields = {
  email:       { required: true, isEmpty: (v: unknown) => !v },
  password:    { required: true, isEmpty: (v: unknown) => !v },
  companyName: { isEmpty: (v: unknown) => !v },
  companySize: { isEmpty: (v: unknown) => !v },
}

type Ctx = { plan: 'personal' | 'business' }
type Plan = Ctx['plan']
type DemoField = keyof typeof fields
type DemoState = {
  email: string
  password: string
  companyName: string
  companySize: string
  plan: Plan
}

const demoUmp = umpire<typeof fields, Ctx>({
  fields,
  rules: [
    enabledWhen('companyName', (_v, ctx) => ctx.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_v, ctx) => ctx.plan === 'business', {
      reason: 'business plan required',
    }),
    requires('companySize', 'companyName'),
  ],
})

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

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function JsonBlock({ value }: { value: string }) {
  return (
    <pre className="zustand-demo__code-block">
      <code>{value}</code>
    </pre>
  )
}

function useStore<S, T>(
  store: {
    getState(): S
    subscribe(listener: (state: S, prevState: S) => void): () => void
  },
  selector: (state: S) => T,
): T {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(() => onStoreChange()),
    () => selector(store.getState()),
    () => selector(store.getState()),
  )
}

function useUmpireStore(umpStore: UmpireStore<typeof fields>) {
  return useSyncExternalStore(
    (onStoreChange) => umpStore.subscribe(() => onStoreChange()),
    () => umpStore.getAvailability(),
    () => umpStore.getAvailability(),
  )
}

export default function ZustandAdapterDemo() {
  const storeRef = useRef<StoreApi<DemoState> | null>(null)
  const umpStoreRef = useRef<UmpireStore<typeof fields> | null>(null)

  if (!storeRef.current) {
    storeRef.current = createStore<DemoState>(() => ({
      email: '',
      password: '',
      companyName: '',
      companySize: '',
      plan: 'personal',
    }))
  }

  if (!umpStoreRef.current) {
    umpStoreRef.current = fromStore(demoUmp, storeRef.current, {
      select: ({ email, password, companyName, companySize }) => ({
        email,
        password,
        companyName,
        companySize,
      }),
      context: (state) => ({ plan: state.plan }),
    })
  }

  const store = storeRef.current
  const umpStore = umpStoreRef.current
  const state = useStore(store, (snapshot) => snapshot)
  const availability = useUmpireStore(umpStore)
  const penalties = umpStore.penalties
  const [subscriptionCount, setSubscriptionCount] = useState(0)

  useEffect(() => {
    const unsubscribe = umpStore.subscribe(() => {
      setSubscriptionCount((count) => count + 1)
    })

    return unsubscribe
  }, [umpStore])

  useEffect(() => {
    return () => {
      umpStore.destroy()
    }
  }, [umpStore])

  function patchState(partial: Partial<DemoState>) {
    store.setState(partial)
  }

  function togglePlan() {
    const nextPlan = state.plan === 'personal' ? 'business' : 'personal'
    store.setState({ plan: nextPlan })
  }

  const enabledCount = fieldOrder.filter((field) => availability[field].enabled).length

  return (
    <div className="zustand-demo">
      <div className="zustand-demo__layout">
        <section className="zustand-demo__panel">
          <div className="zustand-demo__panel-header">
            <div>
              <div className="zustand-demo__eyebrow">Vanilla Zustand Store</div>
              <h2 className="zustand-demo__title">Store State</h2>
            </div>
            <span className="zustand-demo__panel-accent">store.setState()</span>
          </div>

          <div className="zustand-demo__panel-body">
            <div className="zustand-demo__callout">
              <span className="zustand-demo__badge">source of truth</span>
              <p className="zustand-demo__callout-text">
                These controls write straight into the Zustand store. Umpire reacts downstream through
                the adapter.
              </p>
            </div>

            <div className="zustand-demo__controls">
              <div className="zustand-demo__control-group">
                <div className="zustand-demo__control-label">Email</div>
                <div className="zustand-demo__button-row">
                  <button
                    type="button"
                    className="zustand-demo__button"
                    onClick={() => patchState({ email: 'crew@stadium.dev' })}
                  >
                    Set email
                  </button>
                  <button
                    type="button"
                    className="zustand-demo__button zustand-demo__button--ghost"
                    onClick={() => patchState({ email: '' })}
                  >
                    Clear email
                  </button>
                </div>
              </div>

              <div className="zustand-demo__control-group">
                <div className="zustand-demo__control-label">Password</div>
                <div className="zustand-demo__button-row">
                  <button
                    type="button"
                    className="zustand-demo__button"
                    onClick={() => patchState({ password: 'strike-zone' })}
                  >
                    Set password
                  </button>
                  <button
                    type="button"
                    className="zustand-demo__button zustand-demo__button--ghost"
                    onClick={() => patchState({ password: '' })}
                  >
                    Clear password
                  </button>
                </div>
              </div>

              <div className="zustand-demo__control-group">
                <div className="zustand-demo__control-label">Plan Context</div>
                <div className="zustand-demo__button-row">
                  <button
                    type="button"
                    aria-pressed={state.plan === 'business'}
                    className={cls(
                      'zustand-demo__button',
                      'zustand-demo__button--toggle',
                      state.plan === 'business' && 'zustand-demo__button--active',
                    )}
                    onClick={togglePlan}
                  >
                    Toggle plan
                    <span className="zustand-demo__button-value">{state.plan}</span>
                  </button>
                </div>
              </div>

              <div className="zustand-demo__control-group">
                <div className="zustand-demo__control-label">Company Name</div>
                <div className="zustand-demo__button-row">
                  <button
                    type="button"
                    className="zustand-demo__button"
                    onClick={() => patchState({ companyName: 'Acme Stadium Ops' })}
                  >
                    Set company name
                  </button>
                  <button
                    type="button"
                    className="zustand-demo__button zustand-demo__button--ghost"
                    onClick={() => patchState({ companyName: '' })}
                  >
                    Clear company name
                  </button>
                </div>
              </div>
            </div>

            <section className="zustand-demo__json-shell">
              <div className="zustand-demo__json-header">
                <span className="zustand-demo__json-title">store.getState()</span>
                <span className="zustand-demo__json-meta">{state.plan} plan</span>
              </div>
              <JsonBlock value={prettyJson(state)} />
            </section>
          </div>
        </section>

        <section className="zustand-demo__panel">
          <div className="zustand-demo__panel-header">
            <div>
              <div className="zustand-demo__eyebrow">Real Adapter Output</div>
              <h2 className="zustand-demo__title">Umpire Availability</h2>
            </div>
            <div className="zustand-demo__counter">
              <span className="zustand-demo__counter-label">subscribe()</span>
              <span className="zustand-demo__counter-value">{subscriptionCount}</span>
            </div>
          </div>

          <div className="zustand-demo__panel-body">
            <div className="zustand-demo__summary">
              <div className="zustand-demo__summary-card">
                <div className="zustand-demo__summary-label">Adapter</div>
                <code className="zustand-demo__summary-code">fromStore(demoUmp, store, …)</code>
              </div>
              <div className="zustand-demo__summary-card">
                <div className="zustand-demo__summary-label">Enabled</div>
                <div className="zustand-demo__summary-value">
                  {enabledCount}
                  <span className="zustand-demo__summary-total"> / {fieldOrder.length}</span>
                </div>
              </div>
            </div>

            <div className="zustand-demo__field-list">
              {fieldOrder.map((field) => {
                const fieldAvailability = umpStore.field(field)

                return (
                  <article
                    key={field}
                    className={cls(
                      'zustand-demo__field-card',
                      !fieldAvailability.enabled && 'zustand-demo__field-card--disabled',
                    )}
                  >
                    <div className="zustand-demo__field-top">
                      <div>
                        <div className="zustand-demo__field-name">{fieldLabels[field]}</div>
                        <code className="zustand-demo__field-code">{`field('${field}')`}</code>
                      </div>

                      <div
                        className={cls(
                          'zustand-demo__status',
                          fieldAvailability.enabled
                            ? 'zustand-demo__status--enabled'
                            : 'zustand-demo__status--disabled',
                        )}
                      >
                        <span className="zustand-demo__status-dot" />
                        {fieldAvailability.enabled ? 'enabled' : 'disabled'}
                      </div>
                    </div>

                    <div className="zustand-demo__field-grid">
                      <div className="zustand-demo__field-cell">
                        <span className="zustand-demo__field-key">required</span>
                        <span
                          className={cls(
                            'zustand-demo__pill',
                            fieldAvailability.required
                              ? 'zustand-demo__pill--required'
                              : 'zustand-demo__pill--optional',
                          )}
                        >
                          {String(fieldAvailability.required)}
                        </span>
                      </div>

                      <div className="zustand-demo__field-cell zustand-demo__field-cell--reason">
                        <span className="zustand-demo__field-key">reason</span>
                        <span className="zustand-demo__field-reason">
                          {fieldAvailability.reason ?? 'available'}
                        </span>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            <section
              className={cls(
                'zustand-demo__penalties',
                penalties.length > 0 && 'zustand-demo__penalties--alert',
              )}
            >
              <div className="zustand-demo__json-header">
                <span className="zustand-demo__json-title">penalties</span>
                <span className="zustand-demo__json-meta">
                  {penalties.length > 0 ? 'native next/prev tracking' : '[]'}
                </span>
              </div>
              <JsonBlock value={penalties.length > 0 ? prettyJson(penalties) : '[]'} />
            </section>

            <p className="zustand-demo__note">
              Set a company name while the plan is business, then toggle back to personal to watch
              the adapter surface a reset penalty without manual prev-state bookkeeping.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
