/** @jsxImportSource preact */
import { useRef } from 'preact/hooks'
import { enabledWhen, requires, strike, umpire } from '@umpire/core'
import { reactiveUmp, type ReactiveUmpire, type SignalProtocol } from '@umpire/signals'
import { computed, effect, signal } from '@preact/signals'
import '../styles/components/_components.signals-demo.css'

// --- Umpire config ---

const fields = {
  startTime:   { required: true, isEmpty: (value: unknown) => !value },
  endTime:     { required: true, isEmpty: (value: unknown) => !value },
  repeatEvery: { isEmpty: (value: unknown) => !value },
  repeatUnit:  { isEmpty: (value: unknown) => !value },
}

type Cond = { recurring: boolean }
type DemoField = keyof typeof fields

const demoUmp = umpire<typeof fields, Cond>({
  fields,
  rules: [
    // Repeat fields gate on a condition signal — whether the event recurs
    enabledWhen('repeatEvery', (_v, cond) => cond.recurring, {
      reason: 'only applies to recurring events',
    }),
    enabledWhen('repeatUnit', (_v, cond) => cond.recurring, {
      reason: 'only applies to recurring events',
    }),
    // repeatUnit requires an interval to be set first
    requires('repeatUnit', 'repeatEvery'),
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
  'startTime', 'endTime', 'repeatEvery', 'repeatUnit',
] as const satisfies readonly DemoField[]

const fieldLabels: Record<DemoField, string> = {
  startTime:   'Start Time',
  endTime:     'End Time',
  repeatEvery: 'Repeat Every',
  repeatUnit:  'Repeat Unit',
}

const fieldSamples: Record<DemoField, string> = {
  startTime:   '09:00',
  endTime:     '17:00',
  repeatEvery: '2',
  repeatUnit:  'weeks',
}

const modeOptions = [
  { value: false, label: 'Once' },
  { value: true,  label: 'Recurring' },
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
  const foul = reactive.foul(field)

  return (
    <div
      class={cls(
        'c-signals-demo__field',
        !enabled && 'c-umpire-demo__field is-disabled',
        foul && 'c-umpire-demo__field is-fouled',
      )}
    >
      <div class="c-umpire-demo__field-header">
        <div class="c-umpire-demo__field-label">
          <span>{label}</span>
          {required && (
            <span class="c-umpire-demo__required-pill">required</span>
          )}
        </div>
        <span
          class={cls(
            'c-umpire-demo__status',
            foul ? 'c-umpire-demo__status is-fouled' :
            enabled ? 'c-umpire-demo__status is-enabled' : 'c-umpire-demo__status is-disabled',
          )}
        >
          <span class="c-umpire-demo__status-dot" />
          <span class="c-umpire-demo__status-text">
            {foul ? 'fouled' : enabled ? 'enabled' : 'disabled'}
          </span>
        </span>
      </div>

      <div class="c-signals-demo__field-value">
        <code class="c-signals-demo__field-code">
          {hasValue ? String(value) : '—'}
        </code>
      </div>

      <div class="c-signals-demo__button-row">
        <button
          type="button"
          class="c-signals-demo__button"
          disabled={!enabled}
          onClick={() => reactive.set(field, sample)}
        >
          Set
        </button>
        <button
          type="button"
          class="c-signals-demo__button c-signals-demo__button--ghost"
          disabled={!hasValue}
          onClick={() => reactive.set(field, '')}
        >
          Clear
        </button>
      </div>

      {foul && (
        <div class="c-umpire-demo__field-foul">
          <span class="c-umpire-demo__field-foul-reason">{foul.reason}</span>
          <button
            type="button"
            class="c-umpire-demo__field-foul-reset"
            onClick={() => reactive.set(field, foul.suggestedValue ?? '')}
          >
            Reset
          </button>
        </div>
      )}

      {!foul && !enabled && reason && (
        <div class="c-umpire-demo__field-reason">{reason}</div>
      )}
    </div>
  )
}

// --- Main component ---

export default function SignalsFineGrainedDemo() {
  const ref = useRef<{
    reactive: ReactiveUmpire<typeof fields>
    recurringSignal: { value: boolean }
  } | null>(null)

  if (!ref.current) {
    const recurringSignal = signal<boolean>(false)
    const reactive = reactiveUmp(demoUmp, preactAdapter, {
      conditions: { recurring: { get: () => recurringSignal.value } },
    })
    ref.current = { reactive, recurringSignal }
  }

  const { reactive, recurringSignal } = ref.current

  const recurring = recurringSignal.value
  const values = reactive.values
  const fouls = reactive.fouls

  function setRecurring(next: boolean) {
    recurringSignal.value = next
  }

  return (
    <div class="c-signals-demo c-umpire-demo">

      <div class="c-signals-demo__panel">
        <div class="c-umpire-demo__panel-header">
          <div>
            <div class="c-umpire-demo__eyebrow">Live config</div>
            <h2 class="c-umpire-demo__title">Event Recurrence</h2>
          </div>
          <span class="c-umpire-demo__panel-accent">reactiveUmp()</span>
        </div>

        <div class="c-umpire-demo__panel-body">
          {/* Recurring toggle — condition signal, not a field value */}
          <div class="c-umpire-demo__conditions">
            <span class="c-umpire-demo__conditions-label">Conditions</span>
            <code class="c-umpire-demo__conditions-code">{`{ recurring: ${recurring} }`}</code>
          </div>

          <div class="c-umpire-demo__plan-toggle" aria-label="Recurrence mode">
            {modeOptions.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                aria-pressed={recurring === opt.value}
                class={cls(
                  'c-umpire-demo__plan-option',
                  recurring === opt.value && 'c-umpire-demo__plan-option is-active',
                )}
                onClick={() => setRecurring(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Fouls banner — shows when switching modes leaves stale values */}
          {fouls.length > 0 && (
            <div class="c-umpire-demo__fouls">
              <div class="c-umpire-demo__fouls-copy">
                <div class="c-umpire-demo__fouls-kicker">Fouls</div>
                <div class="c-umpire-demo__fouls-list">
                  {fouls.map((foul) => (
                    <div key={foul.field} class="c-umpire-demo__foul">
                      <span class="c-umpire-demo__foul-field">
                        {fieldLabels[foul.field]}
                      </span>
                      <span class="c-umpire-demo__foul-reason">{foul.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                class="c-umpire-demo__reset-button"
                onClick={() => {
                  const next = strike(reactive.values, fouls)
                  if (next !== reactive.values) {
                    reactive.update(next)
                  }
                }}
              >
                Apply resets
              </button>
            </div>
          )}

          {/* Each field reads only the signals it needs during render */}
          <div class="c-signals-demo__fields">
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
          <section class="c-umpire-demo__json-shell">
            <div class="c-umpire-demo__json-header">
              <span class="c-umpire-demo__json-title">signal state</span>
              <span class="c-umpire-demo__json-meta">@preact/signals</span>
            </div>
            <pre class="c-umpire-demo__code-block">
              <code>{prettyJson({ conditions: { recurring }, values, fouls })}</code>
            </pre>
          </section>
        </div>
      </div>
    </div>
  )
}
