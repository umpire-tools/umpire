import { useState } from 'react'
import { enabledWhen, requires, strike, umpire } from '@umpire/core'
import { useUmpire } from '@umpire/react'

// -- Field definitions --
// Each field declares its presence semantics.
// `required` and `isEmpty` influence whether umpire considers the field "satisfied"
// — other rules can depend on satisfaction (e.g. requires()).
const fields = {
  email:           { required: true, default: '', isEmpty: (v: unknown) => !v },
  password:        { required: true, default: '', isEmpty: (v: unknown) => !v },
  confirmPassword: { required: true, default: '', isEmpty: (v: unknown) => !v },
  companyName:     { default: '', isEmpty: (v: unknown) => !v },
  companySize:     { default: '', isEmpty: (v: unknown) => !v },
}

// Conditions are external facts that aren't part of the form values themselves.
// The plan tier comes from account state, not user input — so it's a condition.
type Cond = { plan: 'personal' | 'business' }
type Plan = Cond['plan']
type DemoField = keyof typeof fields

const demoUmp = umpire<typeof fields, Cond>({
  fields,
  rules: [
    // requires() — confirmPassword is only available when password is satisfied.
    // "Satisfied" means non-empty per the isEmpty definition above.
    requires('confirmPassword', 'password'),

    // enabledWhen() — company fields gate on the plan condition, not field values.
    // The reason string appears in check.companyName.reason when disabled.
    enabledWhen('companyName', (_v, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_v, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),

    // requires() chain — companySize depends on companyName being filled in.
    // Combined with the enabledWhen above, this creates a transitive dependency:
    // business plan → companyName filled → companySize available.
    requires('companySize', 'companyName'),
  ],
})

const fieldOrder = [
  'email',
  'password',
  'confirmPassword',
  'companyName',
  'companySize',
] as const satisfies readonly DemoField[]

const fieldMeta: Record<DemoField, { label: string; type: string; placeholder: string }> = {
  email:           { label: 'Email',            type: 'email',    placeholder: 'alex@example.com' },
  password:        { label: 'Password',         type: 'password', placeholder: 'Choose a password' },
  confirmPassword: { label: 'Confirm Password', type: 'password', placeholder: 'Re-enter password' },
  companyName:     { label: 'Company Name',     type: 'text',     placeholder: 'Acme Stadium Ops' },
  companySize:     { label: 'Company Size',     type: 'text',     placeholder: '50 employees' },
}

const planOptions = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
] as const

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export default function ReactAdapterDemo() {
  // init() returns default values for all fields — no manual bookkeeping.
  const [values, setValues] = useState(() => demoUmp.init())
  const [plan, setPlan] = useState<Plan>('personal')

  // useUmpire is the entire integration surface.
  // Pass current values + conditions in, get availability + reset guidance back.
  // No useEffect — this is pure derivation on every render.
  // Previous values are tracked internally via useRef for fouls detection.
  const conditions: Cond = { plan }
  const { check, fouls } = useUmpire(demoUmp, values, conditions)

  function updateValue(field: DemoField, nextValue: string) {
    setValues((current) => ({ ...current, [field]: nextValue }))
  }

  // fouls are reset recommendations — when a field had a value but becomes disabled,
  // umpire suggests clearing it. applyResets acts on those suggestions.
  function applyResets() {
    setValues((current) => strike(current, fouls))
  }

  return (
    <div className="c-react-demo c-umpire-demo">
      {fouls.length > 0 && (
        <div className="c-umpire-demo__fouls">
          <div className="c-umpire-demo__fouls-copy">
            <div className="c-umpire-demo__fouls-kicker">Reset recommendations</div>
            <div className="c-umpire-demo__fouls-list">
              {fouls.map((foul) => (
                <div key={foul.field} className="c-umpire-demo__foul">
                  <span className="c-umpire-demo__foul-field">
                    {fieldMeta[foul.field].label}
                  </span>
                  <span className="c-umpire-demo__foul-reason">{foul.reason}</span>
                </div>
              ))}
            </div>
          </div>
          <button type="button" className="c-umpire-demo__reset-button" onClick={applyResets}>
            Apply resets
          </button>
        </div>
      )}

      <div className="c-umpire-demo__layout">
        <section className="c-umpire-demo__panel c-react-demo__panel--form">
          <div className="c-umpire-demo__panel-header">
            <div>
              <div className="c-umpire-demo__eyebrow">Live component</div>
              <h2 className="c-umpire-demo__title">Signup Form</h2>
            </div>
            <span className="c-umpire-demo__panel-accent">useUmpire()</span>
          </div>

          <div className="c-umpire-demo__panel-body">
            <div className="c-react-demo__callout">
              <span className="c-react-demo__badge">No useEffect</span>
              <p className="c-react-demo__callout-text">
                Pass current values and conditions in. Get live availability and reset guidance back.
                Pure derivation on render.
              </p>
            </div>

            <div className="c-umpire-demo__conditions">
              <span className="c-umpire-demo__conditions-label">Conditions</span>
              <code className="c-umpire-demo__conditions-code">{`{ plan: '${plan}' }`}</code>
            </div>

            <div className="c-umpire-demo__plan-toggle" aria-label="Plan">
              {planOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={plan === option.value}
                  className={cls(
                    'c-umpire-demo__plan-option',
                    plan === option.value && 'c-umpire-demo__plan-option is-active',
                  )}
                  onClick={() => setPlan(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="c-umpire-demo__fields">
              {fieldOrder.map((field) => {
                const meta = fieldMeta[field]
                const availability = check[field]
                const fieldValue = String(values[field] ?? '')

                return (
                  <div
                    key={field}
                    className={cls(
                      'c-umpire-demo__field',
                      !availability.enabled && 'c-umpire-demo__field is-disabled',
                    )}
                  >
                    <div className="c-react-demo__field-header">
                      <label className="c-umpire-demo__label" htmlFor={`react-demo-${field}`}>
                        {meta.label}
                      </label>

                      <div className="c-react-demo__chips">
                        {availability.required && (
                          <span className="c-react-demo__chip c-react-demo__chip--required">
                            required
                          </span>
                        )}
                        <span
                          className={cls(
                            'c-react-demo__chip',
                            availability.enabled
                              ? 'c-react-demo__chip is-enabled'
                              : 'c-react-demo__chip is-disabled',
                          )}
                        >
                          {availability.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </div>
                    </div>

                    <input
                      id={`react-demo-${field}`}
                      className="c-umpire-demo__input"
                      type={meta.type}
                      placeholder={meta.placeholder}
                      disabled={!availability.enabled}
                      value={fieldValue}
                      onChange={(event) => updateValue(field, event.currentTarget.value)}
                    />

                    <div className="c-react-demo__field-meta">
                      <code className="c-react-demo__field-code">check.{field}</code>
                      <span className="c-react-demo__field-reason">
                        {availability.reason ?? 'available'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="c-react-demo__note">
              Fill in a company name on the business plan, then switch back to personal — a foul
              recommends clearing the stale value.
            </p>
          </div>
        </section>

        <section className="c-umpire-demo__panel c-react-demo__panel--output">
          <div className="c-umpire-demo__panel-header">
            <div>
              <div className="c-umpire-demo__eyebrow">Derived hook state</div>
              <h2 className="c-umpire-demo__title">Hook Output</h2>
            </div>
            <span className="c-umpire-demo__panel-accent">live JSON</span>
          </div>

          <div className="c-umpire-demo__panel-body c-react-demo__panel-body--output">
            <div className="c-react-demo__hook-line">
              <span className="c-react-demo__hook-label c-umpire-demo__eyebrow">Hook</span>
              <code className="c-react-demo__hook-code">
                {'const { check, fouls } = useUmpire(demoUmp, values, conditions)'}
              </code>
            </div>

            <section className="c-umpire-demo__json-shell">
              <div className="c-umpire-demo__json-header">
                <span className="c-umpire-demo__json-title">check</span>
                <span className="c-umpire-demo__json-meta">AvailabilityMap</span>
              </div>
              <pre className="c-umpire-demo__code-block">
                <code>{JSON.stringify(check, null, 2)}</code>
              </pre>
            </section>

            <section
              className={cls(
                'c-umpire-demo__json-shell',
                'c-react-demo__json-section--fouls',
                fouls.length > 0 && 'c-react-demo__json-section--alert',
              )}
            >
              <div className="c-umpire-demo__json-header">
                <span className="c-umpire-demo__json-title">fouls</span>
                <span className="c-umpire-demo__json-meta">
                  {fouls.length > 0 ? 'reset recommendations' : '[]'}
                </span>
              </div>
              <pre className="c-umpire-demo__code-block">
                <code>{fouls.length > 0 ? JSON.stringify(fouls, null, 2) : '[]'}</code>
              </pre>
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}
