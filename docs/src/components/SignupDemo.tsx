import { useState } from 'react'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { useUmpire } from '@umpire/react'

const signupFields = {
  email:           { required: true, isEmpty: (v: unknown) => !v },
  password:        { required: true, isEmpty: (v: unknown) => !v },
  confirmPassword: { required: true, isEmpty: (v: unknown) => !v },
  referralCode:    {},
  companyName:     { isEmpty: (v: unknown) => !v },
  companySize:     { isEmpty: (v: unknown) => !v },
}

type SignupConditions = { plan: 'personal' | 'business' }
type SignupField = keyof typeof signupFields

const signupUmp = umpire<typeof signupFields, SignupConditions>({
  fields: signupFields,
  rules: [
    requires('confirmPassword', 'password'),
    enabledWhen('companyName', (_v, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_v, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
    requires('companySize', 'companyName'),
  ],
})

const fieldOrder = [
  'email',
  'password',
  'confirmPassword',
  'referralCode',
  'companyName',
  'companySize',
] as const satisfies readonly SignupField[]

const fieldMeta: Record<SignupField, { label: string; type: string; placeholder: string }> = {
  email: {
    label: 'Email',
    type: 'email',
    placeholder: 'alex@example.com',
  },
  password: {
    label: 'Password',
    type: 'password',
    placeholder: 'Choose a password',
  },
  confirmPassword: {
    label: 'Confirm Password',
    type: 'password',
    placeholder: 'Re-enter password',
  },
  referralCode: {
    label: 'Referral Code',
    type: 'text',
    placeholder: 'Optional',
  },
  companyName: {
    label: 'Company Name',
    type: 'text',
    placeholder: 'Acme Industries',
  },
  companySize: {
    label: 'Company Size',
    type: 'text',
    placeholder: '50 employees',
  },
}

const planOptions = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
] as const

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export default function SignupDemo() {
  const [values, setValues] = useState(() => signupUmp.init())
  const [plan, setPlan] = useState<'personal' | 'business'>('personal')

  const conditions: SignupConditions = { plan }
  const { check: availability, fouls } = useUmpire(signupUmp, values, conditions)

  function updateValue(field: SignupField, nextValue: string) {
    setValues((current) => ({
      ...current,
      [field]: nextValue,
    }))
  }

  function applyResets() {
    setValues((current) => {
      const next = { ...current }

      for (const foul of fouls) {
        next[foul.field] = foul.suggestedValue
      }

      return next
    })
  }

  return (
    <div className="signup-demo umpire-demo">
      {fouls.length > 0 && (
        <div className="umpire-demo__fouls">
          <div className="umpire-demo__fouls-copy">
            <div className="umpire-demo__fouls-kicker">Flag fouls</div>
            <div className="umpire-demo__fouls-list">
              {fouls.map((foul) => (
                <div key={foul.field} className="umpire-demo__foul">
                  <span className="umpire-demo__foul-field">
                    {fieldMeta[foul.field].label}
                  </span>
                  <span className="umpire-demo__foul-reason">{foul.reason}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="umpire-demo__reset-button"
            onClick={applyResets}
          >
            Apply resets
          </button>
        </div>
      )}

      <div className="umpire-demo__layout">
        <section className="umpire-demo__panel signup-demo__panel--form">
          <div className="umpire-demo__panel-header">
            <div>
              <div className="umpire-demo__eyebrow">Live example</div>
              <h2 className="umpire-demo__title">Signup Form</h2>
            </div>
            <span className="umpire-demo__panel-accent">real umpire()</span>
          </div>

          <div className="umpire-demo__panel-body">
            <div className="umpire-demo__plan-toggle" aria-label="Plan">
              {planOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={plan === option.value}
                  className={cls(
                    'umpire-demo__plan-option',
                    plan === option.value && 'umpire-demo__plan-option--active',
                  )}
                  onClick={() => setPlan(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="umpire-demo__fields">
              {fieldOrder.map((field) => {
                const meta = fieldMeta[field]
                const fieldAvailability = availability[field]
                const isEnabled = fieldAvailability.enabled

                return (
                  <div
                    key={field}
                    className={cls(
                      'umpire-demo__field',
                      !isEnabled && 'umpire-demo__field--disabled',
                    )}
                  >
                    <label className="umpire-demo__label" htmlFor={`signup-demo-${field}`}>
                      <span>{meta.label}</span>
                      {fieldAvailability.required && (
                        <span className="signup-demo__required">*</span>
                      )}
                    </label>
                    <input
                      id={`signup-demo-${field}`}
                      className="umpire-demo__input"
                      type={meta.type}
                      placeholder={meta.placeholder}
                      value={String(values[field] ?? '')}
                      disabled={!isEnabled}
                      onChange={(event) => updateValue(field, event.currentTarget.value)}
                    />
                    {!isEnabled && fieldAvailability.reason && (
                      <div className="signup-demo__reason">{fieldAvailability.reason}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="umpire-demo__panel signup-demo__panel--availability">
          <div className="umpire-demo__panel-header">
            <div>
              <div className="umpire-demo__eyebrow">Live state</div>
              <h2 className="umpire-demo__title">Availability</h2>
            </div>
            <span className="umpire-demo__panel-accent">
              plan: {plan}
            </span>
          </div>

          <div className="umpire-demo__panel-body signup-demo__panel-body--table">
            <div className="signup-demo__table-shell">
              <table className="signup-demo__table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Enabled</th>
                    <th>Required</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldOrder.map((field) => {
                    const fieldAvailability = availability[field]

                    return (
                      <tr key={field}>
                        <td className="signup-demo__table-field">{field}</td>
                        <td>
                          <span className="signup-demo__status">
                            <span
                              className={cls(
                                'signup-demo__status-dot',
                                fieldAvailability.enabled
                                  ? 'signup-demo__status-dot--enabled'
                                  : 'signup-demo__status-dot--disabled',
                              )}
                            />
                            {fieldAvailability.enabled ? 'yes' : 'no'}
                          </span>
                        </td>
                        <td className="signup-demo__table-required">
                          {fieldAvailability.required ? '✓' : '—'}
                        </td>
                        <td className="signup-demo__table-reason">
                          {fieldAvailability.reason ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
