import { useState, useRef } from 'react'
import { computed, effect, signal } from '@preact/signals-core'
import { enabledWhen, requires, umpire, type Foul } from '@umpire/core'
import { reactiveUmp, type ReactiveUmpire, type SignalProtocol } from '@umpire/signals'
import '../styles/signals-demo.css'

// --- Umpire config ---

const fields = {
  email:       { required: true, isEmpty: (value: unknown) => !value },
  password:    { required: true, isEmpty: (value: unknown) => !value },
  companyName: { isEmpty: (value: unknown) => !value },
  companySize: { isEmpty: (value: unknown) => !value },
}

type Cond = { plan: 'personal' | 'business' }
type Plan = Cond['plan']
type DemoField = keyof typeof fields

const demoUmp = umpire<typeof fields, Cond>({
  fields,
  rules: [
    // Business-only fields gate on a condition signal, not a field value
    enabledWhen('companyName', (_v, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_v, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
    // companySize requires companyName to be filled and still enabled
    requires('companySize', 'companyName'),
  ],
})

// --- Preact adapter (~10 lines — the entire bridge to any signal library) ---

const preactAdapter: SignalProtocol = {
  signal(initial) {
    const s = signal(initial)
    return { get: () => s.value, set: (v) => { s.value = v } }
  },
  computed(fn) {
    const c = computed(fn)
    return { get: () => c.value }
  },
  effect,
}

// --- Field metadata ---

const fieldOrder = [
  'email', 'password', 'companyName', 'companySize',
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

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

// --- FieldControl: one component per field, one effect per field ---
// This is the idiomatic signals pattern. Each field component owns its own
// signal subscription, its controls, and its availability display. When
// the plan changes, only the fields whose availability moved re-render.

type FieldState = {
  value: unknown
  enabled: boolean
  required: boolean
  reason: string | null
}

function FieldControl({
  field,
  label,
  sample,
  reactive,
}: {
  field: DemoField
  label: string
  sample: string
  reactive: ReactiveUmpire<typeof fields>
}) {
  const [state, setState] = useState<FieldState>(() => {
    const a = reactive.field(field)
    return {
      value: reactive.values[field],
      enabled: a.enabled,
      required: a.required,
      reason: a.reason,
    }
  })

  // One effect per field — tracks only this field's signals
  const effectRef = useRef<(() => void) | null>(null)
  if (!effectRef.current) {
    effectRef.current = effect(() => {
      const a = reactive.field(field)
      const next: FieldState = {
        value: reactive.values[field],
        enabled: a.enabled,
        required: a.required,
        reason: a.reason,
      }
      queueMicrotask(() => setState(next))
    })
  }

  const hasValue = state.value !== null && state.value !== undefined && state.value !== ''

  return (
    <div
      className={cls(
        'signals-demo__field',
        !state.enabled && 'umpire-demo__field--disabled',
      )}
    >
      <div className="umpire-demo__field-header">
        <div className="umpire-demo__field-label">
          <span>{label}</span>
          {state.required && (
            <span className="umpire-demo__required-pill">required</span>
          )}
        </div>
        <span
          className={cls(
            'umpire-demo__status',
            state.enabled ? 'umpire-demo__status--enabled' : 'umpire-demo__status--disabled',
          )}
        >
          <span className="umpire-demo__status-dot" />
          <span className="umpire-demo__status-text">
            {state.enabled ? 'enabled' : 'disabled'}
          </span>
        </span>
      </div>

      <div className="signals-demo__field-value">
        <code className="signals-demo__field-code">
          {hasValue ? String(state.value) : '—'}
        </code>
      </div>

      <div className="signals-demo__button-row">
        <button
          type="button"
          className="signals-demo__button"
          disabled={!state.enabled}
          onClick={() => reactive.set(field, sample)}
        >
          Set
        </button>
        <button
          type="button"
          className="signals-demo__button signals-demo__button--ghost"
          disabled={!hasValue}
          onClick={() => reactive.set(field, '')}
        >
          Clear
        </button>
      </div>

      {!state.enabled && state.reason && (
        <div className="umpire-demo__field-reason">{state.reason}</div>
      )}
    </div>
  )
}

// --- Main component ---

export default function SignalsFineGrainedDemo() {
  const ref = useRef<{
    reactive: ReactiveUmpire<typeof fields>
    planSignal: { value: Plan }
  } | null>(null)

  if (!ref.current) {
    const planSignal = signal<Plan>('personal')
    const reactive = reactiveUmp(demoUmp, preactAdapter, {
      conditions: { plan: { get: () => planSignal.value } },
    })
    ref.current = { reactive, planSignal }
  }

  const { reactive, planSignal } = ref.current

  // Plan + fouls live at the top level since they're cross-cutting.
  // Each FieldControl manages its own availability independently.
  const [plan, setPlanState] = useState<Plan>('personal')
  const [values, setValues] = useState(() => reactive.values)
  const [fouls, setFouls] = useState<Foul<typeof fields>[]>([])

  const effectRef = useRef<(() => void) | null>(null)
  if (!effectRef.current) {
    effectRef.current = effect(() => {
      const nextPlan = planSignal.value
      const nextValues = reactive.values
      const nextFouls = reactive.fouls
      queueMicrotask(() => {
        setPlanState(nextPlan)
        setValues(nextValues)
        setFouls(nextFouls)
      })
    })
  }

  function setPlan(next: Plan) {
    planSignal.value = next
  }

  return (
    <div className="signals-demo umpire-demo">

      <div className="signals-demo__panel">
        <div className="umpire-demo__panel-header">
          <div>
            <div className="umpire-demo__eyebrow">Live form</div>
            <h2 className="umpire-demo__title">Signup</h2>
          </div>
          <span className="umpire-demo__panel-accent">reactiveUmp()</span>
        </div>

        <div className="umpire-demo__panel-body">
          {/* Plan toggle — condition signal, not a field value */}
          <div className="umpire-demo__conditions">
            <span className="umpire-demo__conditions-label">Conditions</span>
            <code className="umpire-demo__conditions-code">{`{ plan: '${plan}' }`}</code>
          </div>

          <div className="umpire-demo__plan-toggle" aria-label="Plan">
            {planOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={plan === opt.value}
                className={cls(
                  'umpire-demo__plan-option',
                  plan === opt.value && 'umpire-demo__plan-option--active',
                )}
                onClick={() => setPlan(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Fouls banner — shows when switching modes leaves stale values */}
          {fouls.length > 0 && (
            <div className="umpire-demo__fouls">
              <div className="umpire-demo__fouls-copy">
                <div className="umpire-demo__fouls-kicker">Fouls</div>
                <div className="umpire-demo__fouls-list">
                  {fouls.map((foul) => (
                    <div key={foul.field} className="umpire-demo__foul">
                      <span className="umpire-demo__foul-field">
                        {fieldLabels[foul.field]}
                      </span>
                      <span className="umpire-demo__foul-reason">{foul.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="umpire-demo__reset-button"
                onClick={() => {
                  for (const foul of fouls) {
                    reactive.set(foul.field, foul.suggestedValue ?? '')
                  }
                }}
              >
                Apply resets
              </button>
            </div>
          )}

          {/* Each field is a self-contained component with its own signal effect */}
          <div className="signals-demo__fields">
            {fieldOrder.map((field) => (
              <FieldControl
                key={field}
                field={field}
                label={fieldLabels[field]}
                sample={fieldSamples[field]}
                reactive={reactive}
              />
            ))}
          </div>

          {/* Live signal state — shows what's happening under the hood */}
          <section className="umpire-demo__json-shell">
            <div className="umpire-demo__json-header">
              <span className="umpire-demo__json-title">signal state</span>
              <span className="umpire-demo__json-meta">@preact/signals-core</span>
            </div>
            <pre className="umpire-demo__code-block">
              <code>{prettyJson({ conditions: { plan }, values })}</code>
            </pre>
          </section>
        </div>
      </div>
    </div>
  )
}
