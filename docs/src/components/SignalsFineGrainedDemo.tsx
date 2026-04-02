import { useRef } from 'preact/hooks'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { reactiveUmp, type ReactiveUmpire, type SignalProtocol } from '@umpire/signals'
import { computed, effect, signal } from '@preact/signals'
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

// --- FieldControl ---
// Each field component subscribes to the signals it reads during render.

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
  const availability = reactive.field(field)
  const value = reactive.values[field]
  const enabled = availability.enabled
  const required = availability.required
  const reason = availability.reason
  const hasValue = value !== null && value !== undefined && value !== ''
  const foul = reactive.fouls.find((f) => f.field === field)

  return (
    <div
      class={cls(
        'signals-demo__field',
        !enabled && 'umpire-demo__field--disabled',
        foul && 'umpire-demo__field--fouled',
      )}
    >
      <div class="umpire-demo__field-header">
        <div class="umpire-demo__field-label">
          <span>{label}</span>
          {required && (
            <span class="umpire-demo__required-pill">required</span>
          )}
        </div>
        <span
          class={cls(
            'umpire-demo__status',
            foul ? 'umpire-demo__status--fouled' :
            enabled ? 'umpire-demo__status--enabled' : 'umpire-demo__status--disabled',
          )}
        >
          <span class="umpire-demo__status-dot" />
          <span class="umpire-demo__status-text">
            {foul ? 'fouled' : enabled ? 'enabled' : 'disabled'}
          </span>
        </span>
      </div>

      <div class="signals-demo__field-value">
        <code class="signals-demo__field-code">
          {hasValue ? String(value) : '—'}
        </code>
      </div>

      <div class="signals-demo__button-row">
        <button
          type="button"
          class="signals-demo__button"
          disabled={!enabled}
          onClick={() => reactive.set(field, sample)}
        >
          Set
        </button>
        <button
          type="button"
          class="signals-demo__button signals-demo__button--ghost"
          disabled={!hasValue}
          onClick={() => reactive.set(field, '')}
        >
          Clear
        </button>
      </div>

      {foul && (
        <div class="umpire-demo__field-foul">
          <span class="umpire-demo__field-foul-reason">{foul.reason}</span>
          <button
            type="button"
            class="umpire-demo__field-foul-reset"
            onClick={() => reactive.set(field, foul.suggestedValue ?? '')}
          >
            Reset
          </button>
        </div>
      )}

      {!foul && !enabled && reason && (
        <div class="umpire-demo__field-reason">{reason}</div>
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

  const plan = planSignal.value
  const values = reactive.values
  const fouls = reactive.fouls

  function setPlan(next: Plan) {
    planSignal.value = next
  }

  return (
    <div class="signals-demo umpire-demo">

      <div class="signals-demo__panel">
        <div class="umpire-demo__panel-header">
          <div>
            <div class="umpire-demo__eyebrow">Live form</div>
            <h2 class="umpire-demo__title">Signup</h2>
          </div>
          <span class="umpire-demo__panel-accent">reactiveUmp()</span>
        </div>

        <div class="umpire-demo__panel-body">
          {/* Plan toggle — condition signal, not a field value */}
          <div class="umpire-demo__conditions">
            <span class="umpire-demo__conditions-label">Conditions</span>
            <code class="umpire-demo__conditions-code">{`{ plan: '${plan}' }`}</code>
          </div>

          <div class="umpire-demo__plan-toggle" aria-label="Plan">
            {planOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={plan === opt.value}
                class={cls(
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
            <div class="umpire-demo__fouls">
              <div class="umpire-demo__fouls-copy">
                <div class="umpire-demo__fouls-kicker">Fouls</div>
                <div class="umpire-demo__fouls-list">
                  {fouls.map((foul) => (
                    <div key={foul.field} class="umpire-demo__foul">
                      <span class="umpire-demo__foul-field">
                        {fieldLabels[foul.field]}
                      </span>
                      <span class="umpire-demo__foul-reason">{foul.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                class="umpire-demo__reset-button"
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

          {/* Each field reads only the signals it needs during render */}
          <div class="signals-demo__fields">
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
          <section class="umpire-demo__json-shell">
            <div class="umpire-demo__json-header">
              <span class="umpire-demo__json-title">signal state</span>
              <span class="umpire-demo__json-meta">@preact/signals</span>
            </div>
            <pre class="umpire-demo__code-block">
              <code>{prettyJson({ conditions: { plan }, values, fouls })}</code>
            </pre>
          </section>
        </div>
      </div>
    </div>
  )
}
