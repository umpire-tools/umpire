import { useState } from 'react'
import { z } from 'zod'
import { check, disables, eitherOf, enabledWhen, fairWhen, requires, umpire } from '@umpire/core'
// useUmpireWithDevtools powers the named instance in the optional panel on this page.
// Swap back to: import { useUmpire } from '@umpire/react'  (remove leading id arg)
import { useUmpireWithDevtools } from '@umpire/devtools/react'
import { createZodAdapter } from '@umpire/zod'
import { zodValidationExtension } from '@umpire/zod/devtools'

// ── Known SSO domains ─────────────────────────────────────────────────────────
// When the email domain matches one of these, SSO mode activates automatically:
// password fields disable, plan flips to business, and company name fills in.

const knownDomains: Record<string, string> = {
  'acme.com':      'Acme Corporation',
  'globocorp.io':  'GloboCorp Industries',
  'initech.net':   'Initech',
  'umbrella.corp': 'Umbrella Corporation',
}

function domainFromEmail(email: string): string | null {
  const at = email.indexOf('@')
  if (at < 0) return null
  return email.slice(at + 1).toLowerCase().trim() || null
}

// ── Umpire: field availability ───────────────────────────────────────────────

const signupFields = {
  email:           { required: true, isEmpty: (v: unknown) => !v },
  password:        { required: true, isEmpty: (v: unknown) => !v },
  confirmPassword: { required: true, isEmpty: (v: unknown) => !v },
  referralCode:    {},
  companyName:     { required: true, isEmpty: (v: unknown) => !v },
  companySize:     { required: true, isEmpty: (v: unknown) => !v },
  submit:          { required: true },
}

type SignupConditions = { plan: 'personal' | 'business'; sso: boolean }
type SignupField = keyof typeof signupFields

// ── Zod: per-field validation schemas ────────────────────────────────────────
// These are the "correctness" checks. Umpire handles "should this field be
// in play?" — Zod handles "is this value well-formed?"

const fieldSchemas = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  confirmPassword: z.string(),
  referralCode: z.string(),
  companyName: z.string(),
  companySize: z.string().regex(/^\d+$/, 'Must be a number'),
})

const signupValidation = createZodAdapter({
  schemas: fieldSchemas.shape,
  build(baseSchema) {
    // Keep the schema-level refinement too: Umpire owns availability and
    // blocked-submit reasons, while this remains an optional final parse-time
    // correctness check for submit handlers and tooling.
    return baseSchema.refine(
      (data) => !data.confirmPassword || !data.password || data.confirmPassword === data.password,
      { message: 'Passwords do not match', path: ['confirmPassword'] },
    )
  },
})

const hasValidEmail = check('email', fieldSchemas.shape.email)
const hasStrongPassword = check('password', fieldSchemas.shape.password)
const hasNumericCompanySize = check('companySize', fieldSchemas.shape.companySize)

const signupUmp = umpire<typeof signupFields, SignupConditions>({
  fields: signupFields,
  rules: [
    requires('confirmPassword', 'password'),
    // Model the password/confirmation relationship structurally so Umpire can
    // see it for fair/foul state and downstream dependency chains, independent
    // of whether the Zod object-level refine runs on a given pass.
    fairWhen('confirmPassword', (confirmPassword, values) => confirmPassword === values.password, {
      reason: 'Match your password exactly',
    }),
    enabledWhen('companyName', (_v, c) => c.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_v, c) => c.plan === 'business', {
      reason: 'business plan required',
    }),
    requires('companySize', 'companyName'),

    // When SSO is active, the IdP handles authentication — password is not needed
    disables((_v, c) => c.sso, ['password', 'confirmPassword'], {
      reason: 'SSO login — no password needed',
    }),

    // Submit can unlock through named auth paths without forcing a single
    // winning branch the way oneOf() would.
    eitherOf('submitAuth', {
      sso: [
        enabledWhen('submit', (_v, c) => c.sso, {
          reason: 'No SSO available for this domain',
        }),
      ],
      password: [
        enabledWhen('submit', hasValidEmail, {
          reason: 'Enter a valid email address',
        }),
        enabledWhen('submit', (v) => !!v.password, {
          reason: 'Enter a password',
        }),
        enabledWhen('submit', hasStrongPassword, {
          reason: 'Use at least 8 password characters',
        }),
        enabledWhen('submit', (v) => !!v.confirmPassword, {
          reason: 'Confirm your password',
        }),
        enabledWhen('submit', (v) => v.confirmPassword === v.password, {
          reason: 'Passwords must match',
        }),
      ],
    }),

    enabledWhen('submit', (v, c) => c.plan !== 'business' || !!v.companyName, {
      reason: 'Enter a company name',
    }),
    enabledWhen('submit', (v, c) => c.plan !== 'business' || !!v.companySize, {
      reason: 'Enter company size',
    }),
    enabledWhen('submit', (v, c) => c.plan !== 'business' || hasNumericCompanySize(v, c), {
      reason: 'Company size must be a number',
    }),
  ],
  validators: signupValidation.validators,
})

type SignupValues = ReturnType<typeof signupUmp.init>

// ── Field metadata ───────────────────────────────────────────────────────────

const fieldOrder = [
  'email',
  'password',
  'confirmPassword',
  'referralCode',
  'companyName',
  'companySize',
] as const satisfies readonly SignupField[]

// submit is shown in the availability table but not rendered as an input
const tableOrder = [...fieldOrder, 'submit'] as const satisfies readonly SignupField[]

const fieldMeta: Record<SignupField, { label: string; type: string; placeholder: string }> = {
  email:           { label: 'Email',            type: 'email',    placeholder: 'alex@example.com' },
  password:        { label: 'Password',         type: 'password', placeholder: 'Choose a password' },
  confirmPassword: { label: 'Confirm Password', type: 'password', placeholder: 'Re-enter password' },
  referralCode:    { label: 'Referral Code',    type: 'text',     placeholder: 'Optional' },
  companyName:     { label: 'Company Name',     type: 'text',     placeholder: 'Acme Corporation' },
  companySize:     { label: 'Company Size',     type: 'text',     placeholder: '50' },
  submit:          { label: 'Submit',           type: 'submit',   placeholder: '' },
}

const planOptions = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
] as const

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SignupDemo() {
  const [values, setValues] = useState(() => signupUmp.init())
  const [plan, setPlan] = useState<'personal' | 'business'>('personal')
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [submissionIssues, setSubmissionIssues] = useState<Array<{ field: string; message: string }>>([])

  // SSO is derived from the email — no extra state needed
  const emailDomain = domainFromEmail(String(values.email ?? ''))
  const ssoCompany = emailDomain ? (knownDomains[emailDomain] ?? null) : null
  const sso = ssoCompany !== null

  const conditions: SignupConditions = { plan, sso }
  const { check: availability, fouls } = useUmpireWithDevtools('signup', signupUmp, values, conditions, {
    extensions: [
      zodValidationExtension({
        resolve({ scorecard, values }) {
          return signupValidation.run(scorecard.check, values)
        },
      }),
    ],
  })

  function updateValue(field: SignupField, nextValue: string) {
    setSubmissionIssues([])

    if (field === 'email') {
      const domain = domainFromEmail(nextValue)
      const company = domain ? (knownDomains[domain] ?? null) : null

      setValues((current) => ({
        ...current,
        email: nextValue,
        // Auto-fill company name when an SSO domain is recognized
        ...(company != null ? { companyName: company } : {}),
      }))

      if (company != null) {
        setPlan('business')
      }
    } else {
      setValues((current) => ({ ...current, [field]: nextValue }))
    }
  }

  function markTouched(field: string) {
    setTouched((prev) => new Set(prev).add(field))
  }

  function applyResets() {
    setSubmissionIssues([])
    setValues((current) => {
      const next = { ...current }
      for (const foul of fouls) {
        ;(next as Record<string, unknown>)[foul.field] = foul.suggestedValue
      }
      return next
    })
  }

  function submit() {
    const result = signupValidation.run(availability, values)
    setSubmissionIssues(result.normalizedErrors)
  }

  const canSubmit = availability.submit.enabled

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
                    {fieldMeta[foul.field as SignupField]?.label ?? foul.field}
                  </span>
                  <span className="umpire-demo__foul-reason">{foul.reason}</span>
                </div>
              ))}
            </div>
          </div>
          <button type="button" className="umpire-demo__reset-button" onClick={applyResets}>
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
            {sso ? (
              <span className="signup-demo__sso-badge">
                SSO — {ssoCompany}
              </span>
            ) : (
              <span className="umpire-demo__panel-accent">umpire + zod</span>
            )}
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
                  onClick={() => {
                    setSubmissionIssues([])
                    setPlan(option.value)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="umpire-demo__fields">
              {fieldOrder.map((field) => {
                const meta = fieldMeta[field]
                const av = availability[field]
                const isEnabled = av.enabled
                const error = isEnabled && touched.has(field)
                  ? av.error ?? (av.fair === false ? av.reason : undefined)
                  : undefined

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
                      {av.required && <span className="signup-demo__required">*</span>}
                    </label>
                    <input
                      id={`signup-demo-${field}`}
                      className={cls(
                        'umpire-demo__input',
                        error && 'signup-demo__input--invalid',
                      )}
                      type={meta.type}
                      placeholder={meta.placeholder}
                      value={String(values[field] ?? '')}
                      disabled={!isEnabled}
                      onChange={(event) => updateValue(field, event.currentTarget.value)}
                      onBlur={() => markTouched(field)}
                    />
                    {!isEnabled && av.reason && (
                      <div className="signup-demo__reason">{av.reason}</div>
                    )}
                    {isEnabled && error && (
                      <div className="signup-demo__validation-error">{error}</div>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              disabled={!canSubmit}
              className={cls(
                'signup-demo__submit',
                canSubmit ? 'signup-demo__submit--ready' : 'signup-demo__submit--blocked',
              )}
              onClick={submit}
            >
              {sso ? `Continue with SSO` : `Create account`}
            </button>
            {!canSubmit && availability.submit.reason && (
              <div className="signup-demo__reason">{availability.submit.reason}</div>
            )}
          </div>
        </section>

        <section className="umpire-demo__panel signup-demo__panel--availability">
          <div className="umpire-demo__panel-header">
            <div>
              <div className="umpire-demo__eyebrow">Live state</div>
              <h2 className="umpire-demo__title">Availability + Validation</h2>
            </div>
            <span className="umpire-demo__panel-accent">
              {sso ? `sso: true` : `plan: ${plan}`}
            </span>
          </div>

          <div className="umpire-demo__panel-body signup-demo__panel-body--table">
            <div className="signup-demo__table-shell">
              <table className="signup-demo__table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Enabled</th>
                    <th>Valid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tableOrder.map((field) => {
                    const av = availability[field]
                    const error = field !== 'submit' && av.enabled
                      ? av.error ?? (av.fair === false ? av.reason : undefined)
                      : undefined

                    return (
                      <tr key={field} className={field === 'submit' ? 'signup-demo__table-row--submit' : undefined}>
                        <td className="signup-demo__table-field">{field}</td>
                        <td>
                          <span className="signup-demo__status">
                            <span
                              className={cls(
                                'signup-demo__status-dot',
                                av.enabled
                                  ? 'signup-demo__status-dot--enabled'
                                  : 'signup-demo__status-dot--disabled',
                              )}
                            />
                            {av.enabled ? 'yes' : 'no'}
                          </span>
                        </td>
                        <td>
                          {av.enabled ? (
                            <span className="signup-demo__status">
                              <span
                                className={cls(
                                  'signup-demo__status-dot',
                                  error
                                    ? 'signup-demo__status-dot--disabled'
                                    : 'signup-demo__status-dot--enabled',
                                )}
                              />
                              {error ? 'no' : 'yes'}
                            </span>
                          ) : (
                            <span className="signup-demo__table-reason">—</span>
                          )}
                        </td>
                        <td className="signup-demo__table-reason">
                          {!av.enabled
                            ? av.reason ?? '—'
                            : field === 'submit'
                              ? (av.enabled ? '✓' : av.reason ?? '—')
                              : error ?? (av.required && !values[field as SignupField] ? 'empty' : '✓')}
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

      {submissionIssues.length > 0 && (
        <div className="umpire-demo__fouls">
          <div className="umpire-demo__fouls-copy">
            <div className="umpire-demo__fouls-kicker">Submit validation</div>
            <div className="umpire-demo__fouls-list">
              {submissionIssues.map((issue) => (
                <div key={`${issue.field}:${issue.message}`} className="umpire-demo__foul">
                  <span className="umpire-demo__foul-field">
                    {fieldMeta[issue.field as SignupField]?.label ?? issue.field}
                  </span>
                  <span className="umpire-demo__foul-reason">{issue.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
