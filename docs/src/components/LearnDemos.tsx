/** @jsxImportSource preact */
import { useMemo, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import {
  anyOf,
  check,
  disables,
  eitherOf,
  enabledWhen,
  oneOf,
  requires,
  strike,
  umpire,
} from '@umpire/core'
import { snapshotValue } from '@umpire/core/snapshot'
import type { FieldStatus } from '@umpire/core'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^\d{10,}$/

const planOptions = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
] as const

const handlingOptions = [
  { value: 'standard', label: 'Standard' },
  { value: 'express', label: 'Express' },
  { value: 'pickup', label: 'Pickup' },
] as const

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function StatusPill({ enabled, text }: { enabled: boolean; text?: string }) {
  return (
    <span
      className={cls(
        'c-umpire-demo__status',
        enabled ? 'c-umpire-demo__status is-enabled' : 'c-umpire-demo__status is-disabled',
      )}
    >
      <span className="c-umpire-demo__status-dot" />
      <span className="c-umpire-demo__status-text">{text ?? (enabled ? 'enabled' : 'disabled')}</span>
    </span>
  )
}

function FieldCard({
  label,
  availability,
  children,
  reason,
}: {
  label: string
  availability: FieldStatus
  children: ComponentChildren
  reason?: string | null
}) {
  const message = reason ?? (!availability.enabled ? availability.reason : null)

  return (
    <div
      className={cls(
        'c-umpire-demo__field',
        !availability.enabled && 'c-umpire-demo__field is-disabled',
      )}
    >
      <div className="c-umpire-demo__field-header">
        <div className="c-umpire-demo__field-label">
          <span>{label}</span>
          {availability.required && <span className="c-umpire-demo__required-pill">required</span>}
        </div>
        <StatusPill enabled={availability.enabled} />
      </div>

      {children}
      <div className="c-umpire-demo__field-reason">{message ?? ''}</div>
    </div>
  )
}

function ToggleGroup<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  ariaLabel: string
  onChange: (next: T) => void
}) {
  return (
    <div
      className="c-umpire-demo__plan-toggle"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cls(
            'c-umpire-demo__plan-option',
            value === option.value && 'c-umpire-demo__plan-option is-active',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const requiresFields = {
  password: { isEmpty: (value: unknown) => !value },
  confirmPassword: { isEmpty: (value: unknown) => !value },
}

const requiresUmp = umpire<typeof requiresFields>({
  fields: requiresFields,
  rules: [
    requires('confirmPassword', 'password'),
  ],
})

export function RequiresDemo() {
  const [values, setValues] = useState({
    password: '',
    confirmPassword: '',
  })

  const availability = requiresUmp.check(values)

  return (
    <div className="c-learn-demo__row">
      <FieldCard label="Password" availability={availability.password}>
        <input
          className="c-umpire-demo__input"
          type="password"
          aria-label="Password"
          placeholder="Enter a password"
          value={values.password}
          onInput={(event) => {
            const v = event.currentTarget.value
            setValues((current) => ({ ...current, password: v }))
          }}
        />
      </FieldCard>

      <FieldCard label="Confirm password" availability={availability.confirmPassword}>
        <input
          className="c-umpire-demo__input"
          type="password"
          aria-label="Confirm password"
          placeholder="Repeats the first field"
          value={values.confirmPassword}
          disabled={!availability.confirmPassword.enabled}
          onInput={(event) => {
            const v = event.currentTarget.value
            setValues((current) => ({ ...current, confirmPassword: v }))
          }}
        />
      </FieldCard>
    </div>
  )
}

const enabledWhenFields = {
  companyName: { isEmpty: (value: unknown) => !value },
}

type PlanConditions = {
  plan: 'personal' | 'business'
}

const enabledWhenUmp = umpire<typeof enabledWhenFields, PlanConditions>({
  fields: enabledWhenFields,
  rules: [
    enabledWhen('companyName', (_values, conditions) => conditions.plan === 'business', {
      reason: 'business plan required',
    }),
  ],
})

export function EnabledWhenDemo() {
  const [plan, setPlan] = useState<PlanConditions['plan']>('personal')
  const [companyName, setCompanyName] = useState('')
  const availability = enabledWhenUmp.check({ companyName }, { plan })

  return (
    <div className="c-learn-demo__stack">
      <ToggleGroup
        value={plan}
        options={planOptions}
        ariaLabel="Plan"
        onChange={setPlan}
      />

      <div className="c-learn-demo__row">
        <FieldCard label="Company name" availability={availability.companyName}>
          <input
            className="c-umpire-demo__input"
            type="text"
            aria-label="Company name"
            placeholder="Acme Logistics"
            value={companyName}
            disabled={!availability.companyName.enabled}
            onInput={(event) => setCompanyName(event.currentTarget.value)}
          />
        </FieldCard>
      </div>
    </div>
  )
}

const disablesFields = {
  bannerMode: { isEmpty: (value: unknown) => !value },
  paperSize: { isEmpty: (value: unknown) => !value },
}

const disablesUmp = umpire<typeof disablesFields>({
  fields: disablesFields,
  rules: [
    disables('bannerMode', ['paperSize'], {
      reason: 'banner mode uses continuous feed',
    }),
  ],
})

export function DisablesDemo() {
  const [bannerMode, setBannerMode] = useState(false)
  const [paperSize, setPaperSize] = useState('A4')
  const availability = disablesUmp.check({
    bannerMode: bannerMode ? 'on' : undefined,
    paperSize,
  })

  return (
    <div className="c-learn-demo__row">
      <div className="c-umpire-demo__field">
        <div className="c-umpire-demo__field-header">
          <div className="c-umpire-demo__field-label">
            <span>Banner mode</span>
          </div>
          <StatusPill enabled={bannerMode} text={bannerMode ? 'active' : 'idle'} />
        </div>

        <label className="c-learn-demo__toggle">
          <input
            type="checkbox"
            checked={bannerMode}
            onChange={(event) => setBannerMode(event.currentTarget.checked)}
          />
          <span>Use continuous feed paper</span>
        </label>
      </div>

      <FieldCard label="Paper size" availability={availability.paperSize}>
        <select
          className="c-umpire-demo__input c-learn-demo__select"
          aria-label="Paper size"
          value={paperSize}
          disabled={!availability.paperSize.enabled}
          onChange={(event) => setPaperSize(event.currentTarget.value)}
        >
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
          <option value="Legal">Legal</option>
        </select>
      </FieldCard>
    </div>
  )
}

const oneOfFields = {
  standardRate: { isEmpty: (value: unknown) => !value },
  expressRate: { isEmpty: (value: unknown) => !value },
  pickupLocation: { isEmpty: (value: unknown) => !value },
}

type HandlingConditions = {
  handling: 'standard' | 'express' | 'pickup'
}

const oneOfUmp = umpire<typeof oneOfFields, HandlingConditions>({
  fields: oneOfFields,
  rules: [
    oneOf(
      'handling',
      {
        standard: ['standardRate'],
        express: ['expressRate'],
        pickup: ['pickupLocation'],
      },
      {
        activeBranch: (_values, conditions) => conditions.handling,
      },
    ),
  ],
})

export function OneOfDemo() {
  const [handling, setHandling] = useState<HandlingConditions['handling']>('standard')
  const [values, setValues] = useState({
    standardRate: '',
    expressRate: '',
    pickupLocation: '',
  })
  const availability = oneOfUmp.check(values, { handling })

  return (
    <div className="c-learn-demo__stack">
      <ToggleGroup
        value={handling}
        options={handlingOptions}
        ariaLabel="Handling mode"
        onChange={setHandling}
      />

      <div className="c-learn-demo__row">
        <FieldCard label="Standard rate" availability={availability.standardRate}>
          <input
            className="c-umpire-demo__input"
            type="text"
            aria-label="Standard rate"
            placeholder="$12.00"
            value={values.standardRate}
            disabled={!availability.standardRate.enabled}
            onInput={(event) => {
              const v = event.currentTarget.value
              setValues((current) => ({ ...current, standardRate: v }))
            }}
          />
        </FieldCard>

        <FieldCard label="Express rate" availability={availability.expressRate}>
          <input
            className="c-umpire-demo__input"
            type="text"
            aria-label="Express rate"
            placeholder="$24.00"
            value={values.expressRate}
            disabled={!availability.expressRate.enabled}
            onInput={(event) => {
              const v = event.currentTarget.value
              setValues((current) => ({ ...current, expressRate: v }))
            }}
          />
        </FieldCard>

        <FieldCard label="Pickup location" availability={availability.pickupLocation}>
          <input
            className="c-umpire-demo__input"
            type="text"
            aria-label="Pickup location"
            placeholder="Front desk"
            value={values.pickupLocation}
            disabled={!availability.pickupLocation.enabled}
            onInput={(event) => {
              const v = event.currentTarget.value
              setValues((current) => ({ ...current, pickupLocation: v }))
            }}
          />
        </FieldCard>
      </div>
    </div>
  )
}

const checkFields = {
  email: { isEmpty: (value: unknown) => !value },
  submit: {},
}

const checkUmp = umpire<typeof checkFields>({
  fields: checkFields,
  rules: [
    enabledWhen('submit', check('email', emailPattern), {
      reason: 'enter a valid email',
    }),
  ],
})

export function CheckDemo() {
  const [email, setEmail] = useState('')
  const availability = checkUmp.check({ email, submit: undefined })

  return (
    <div className="c-learn-demo__row">
      <FieldCard label="Email" availability={availability.email}>
        <input
          className="c-umpire-demo__input"
          type="email"
          aria-label="Email"
          placeholder="user@example.com"
          value={email}
          onInput={(event) => setEmail(event.currentTarget.value)}
        />
      </FieldCard>

      <FieldCard label="Submit" availability={availability.submit}>
        <button
          type="button"
          className="c-learn-demo__submit"
          disabled={!availability.submit.enabled}
        >
          Continue
        </button>
      </FieldCard>
    </div>
  )
}

const anyOfFields = {
  phone: { isEmpty: (value: unknown) => !value },
  email: { isEmpty: (value: unknown) => !value },
  submit: {},
}

const anyOfUmp = umpire<typeof anyOfFields>({
  fields: anyOfFields,
  rules: [
    anyOf(
      enabledWhen('submit', check('phone', phonePattern), {
        reason: 'enter a valid phone',
      }),
      enabledWhen('submit', check('email', emailPattern), {
        reason: 'enter a valid email',
      }),
    ),
  ],
})

export function AnyOfDemo() {
  const [values, setValues] = useState({
    phone: '',
    email: '',
  })
  const availability = anyOfUmp.check({ ...values, submit: undefined })
  const submitReason = availability.submit.enabled
    ? null
    : availability.submit.reasons.join(' or ')

  return (
    <div className="c-learn-demo__row">
      <FieldCard label="Phone" availability={availability.phone}>
        <input
          className="c-umpire-demo__input"
          type="tel"
          aria-label="Phone"
          placeholder="5551234567"
          value={values.phone}
          onInput={(event) => {
            const v = event.currentTarget.value
            setValues((current) => ({ ...current, phone: v }))
          }}
        />
      </FieldCard>

      <FieldCard label="Email" availability={availability.email}>
        <input
          className="c-umpire-demo__input"
          type="email"
          aria-label="Email"
          placeholder="user@example.com"
          value={values.email}
          onInput={(event) => {
            const v = event.currentTarget.value
            setValues((current) => ({ ...current, email: v }))
          }}
        />
      </FieldCard>

      <FieldCard
        label="Submit"
        availability={availability.submit}
        reason={submitReason}
      >
        <button
          type="button"
          className="c-learn-demo__submit"
          disabled={!availability.submit.enabled}
        >
          Request link
        </button>
      </FieldCard>
    </div>
  )
}

const eitherOfFields = {
  username: { isEmpty: (value: unknown) => !value },
  password: { isEmpty: (value: unknown) => !value },
  token:    { isEmpty: (value: unknown) => !value },
  submit:   {},
}

const eitherOfUmp = umpire<typeof eitherOfFields>({
  fields: eitherOfFields,
  rules: [
    eitherOf('loginPath', {
      token: [
        enabledWhen('submit', ({ token }) => !!token, {
          reason: 'Enter a token',
        }),
      ],
      credentials: [
        enabledWhen('submit', ({ username }) => !!username, {
          reason: 'Enter a username',
        }),
        enabledWhen('submit', ({ password }) => !!password, {
          reason: 'Enter a password',
        }),
      ],
    }),
  ],
})

export function EitherOfDemo() {
  const [values, setValues] = useState({
    username: '',
    password: '',
    token: '',
  })
  const availability = eitherOfUmp.check({ ...values, submit: undefined })

  function update(field: 'username' | 'password' | 'token', v: string) {
    setValues((current) => ({ ...current, [field]: v }))
  }

  return (
    <div className="c-learn-demo__stack">
      <div className="c-learn-demo__row">
        <FieldCard label="Username" availability={availability.username}>
          <input
            className="c-umpire-demo__input"
            type="text"
            aria-label="Username"
            placeholder="alice"
            value={values.username}
            onInput={(event) => update('username', event.currentTarget.value)}
          />
        </FieldCard>

        <FieldCard label="Password" availability={availability.password}>
          <input
            className="c-umpire-demo__input"
            type="password"
            aria-label="Password"
            placeholder="••••••••"
            value={values.password}
            onInput={(event) => update('password', event.currentTarget.value)}
          />
        </FieldCard>

        <FieldCard label="Backup token" availability={availability.token}>
          <input
            className="c-umpire-demo__input"
            type="text"
            aria-label="Backup token"
            placeholder="ABC-123"
            value={values.token}
            onInput={(event) => update('token', event.currentTarget.value)}
          />
        </FieldCard>

        <FieldCard label="Submit" availability={availability.submit}>
          <button
            type="button"
            className="c-learn-demo__submit"
            disabled={!availability.submit.enabled}
          >
            Sign in
          </button>
        </FieldCard>
      </div>
    </div>
  )
}

const playFields = {
  companyName: { isEmpty: (value: unknown) => !value },
  companySize: { isEmpty: (value: unknown) => !value },
}

const playFieldLabels = {
  companyName: 'Company name',
  companySize: 'Company size',
} as const

const playUmp = umpire<typeof playFields, PlanConditions>({
  fields: playFields,
  rules: [
    enabledWhen('companyName', (_values, conditions) => conditions.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_values, conditions) => conditions.plan === 'business', {
      reason: 'business plan required',
    }),
    requires('companySize', 'companyName'),
  ],
})

export function PlayDemo() {
  const [plan, setPlan] = useState<PlanConditions['plan']>('business')
  const [values, setValues] = useState({
    companyName: '',
    companySize: '',
  })

  const conditions = { plan }
  const availability = useMemo(() => playUmp.check(values, conditions), [values, plan])
  const prevRef = useRef({
    values: snapshotValue(values),
    conditions: snapshotValue(conditions),
  })
  const fouls = useMemo(() => {
    const result = playUmp.play(prevRef.current, { values, conditions })
    prevRef.current = {
      values: snapshotValue(values),
      conditions: snapshotValue(conditions),
    }
    return result
  }, [values, plan])

  function updateValue(field: keyof typeof playFields, nextValue: string) {
    setValues((current) => ({
      ...current,
      [field]: nextValue,
    }))
  }

  function applyResets() {
    setValues((current) => strike(current, fouls))
  }

  return (
    <div className="c-learn-demo__stack">
      {fouls.length > 0 && (
        <div className="c-umpire-demo__fouls">
          <div className="c-umpire-demo__fouls-copy">
            <div className="c-umpire-demo__fouls-kicker">Foul calls</div>
            <div className="c-umpire-demo__fouls-list">
              {fouls.map((foul) => (
                <div key={foul.field} className="c-umpire-demo__foul">
                  <span className="c-umpire-demo__foul-field">{playFieldLabels[foul.field]}</span>
                  <span className="c-umpire-demo__foul-reason">{foul.reason}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="c-umpire-demo__reset-button"
            onClick={applyResets}
          >
            Apply resets
          </button>
        </div>
      )}

      <ToggleGroup
        value={plan}
        options={planOptions}
        ariaLabel="Plan"
        onChange={setPlan}
      />

      <div className="c-learn-demo__row">
        <FieldCard label="Company name" availability={availability.companyName}>
          <input
            className="c-umpire-demo__input"
            type="text"
            aria-label="Company name"
            placeholder="Acme Logistics"
            value={String(values.companyName ?? '')}
            disabled={!availability.companyName.enabled}
            onInput={(event) => updateValue('companyName', event.currentTarget.value)}
          />
        </FieldCard>

        <FieldCard label="Company size" availability={availability.companySize}>
          <input
            className="c-umpire-demo__input"
            type="text"
            aria-label="Company size"
            placeholder="50 seats"
            value={String(values.companySize ?? '')}
            disabled={!availability.companySize.enabled}
            onInput={(event) => updateValue('companySize', event.currentTarget.value)}
          />
        </FieldCard>
      </div>
    </div>
  )
}
