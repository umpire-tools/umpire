import { useState, type ReactNode } from 'react'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { useUmpire } from '@umpire/react'

const fields = {
  email:           { required: true, isEmpty: (v: unknown) => !v },
  password:        { required: true, isEmpty: (v: unknown) => !v },
  confirmPassword: { required: true, isEmpty: (v: unknown) => !v },
  companyName:     { isEmpty: (v: unknown) => !v },
}

type Cond = { plan: 'personal' | 'business' }
type Plan = Cond['plan']
type DemoField = keyof typeof fields

const demoUmp = umpire<typeof fields, Cond>({
  fields,
  rules: [
    requires('confirmPassword', 'password'),
    enabledWhen('companyName', (_v, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
  ],
})

const fieldOrder = [
  'email',
  'password',
  'confirmPassword',
  'companyName',
] as const satisfies readonly DemoField[]

const fieldMeta: Record<DemoField, { label: string; type: string; placeholder: string }> = {
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
  companyName: {
    label: 'Company Name',
    type: 'text',
    placeholder: 'Acme Stadium Ops',
  },
}

const planOptions = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
] as const

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

function prettyJson(obj: unknown) {
  return JSON.stringify(obj, null, 2)
}

function tokenizeJsonLine(line: string, lineIndex: number) {
  const tokenPattern = /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  const tokens: ReactNode[] = []
  let lastIndex = 0

  for (const match of line.matchAll(tokenPattern)) {
    const start = match.index ?? 0
    const token = match[0]

    if (start > lastIndex) {
      tokens.push(
        <span key={`plain-${lineIndex}-${lastIndex}`}>
          {line.slice(lastIndex, start)}
        </span>,
      )
    }

    let className = 'react-demo__token react-demo__token--punctuation'

    if (match[1]) {
      className = 'react-demo__token react-demo__token--key'
    } else if (match[2]) {
      className = 'react-demo__token react-demo__token--string'
    } else if (match[3]) {
      className = 'react-demo__token react-demo__token--boolean'
    } else if (token === 'null') {
      className = 'react-demo__token react-demo__token--null'
    } else if (match[4]) {
      className = 'react-demo__token react-demo__token--number'
    }

    tokens.push(
      <span key={`token-${lineIndex}-${start}`} className={className}>
        {token}
      </span>,
    )

    lastIndex = start + token.length
  }

  if (lastIndex < line.length) {
    tokens.push(
      <span key={`tail-${lineIndex}-${lastIndex}`}>
        {line.slice(lastIndex)}
      </span>,
    )
  }

  return tokens
}

function JsonBlock({ value }: { value: string }) {
  return (
    <pre className="react-demo__code-block">
      <code>
        {value.split('\n').map((line, index) => (
          <span key={`${index}-${line}`} className="react-demo__code-line">
            {tokenizeJsonLine(line, index)}
          </span>
        ))}
      </code>
    </pre>
  )
}

export default function ReactAdapterDemo() {
  const [values, setValues] = useState(() => demoUmp.init())
  const [plan, setPlan] = useState<Plan>('personal')

  const conditions: Cond = { plan }
  const { check, penalties } = useUmpire(demoUmp, values, conditions)

  function updateValue(field: DemoField, nextValue: string) {
    setValues((current) => ({
      ...current,
      [field]: nextValue,
    }))
  }

  return (
    <div className="react-demo">
      <div className="react-demo__layout">
        <section className="react-demo__panel react-demo__panel--component">
          <div className="react-demo__panel-header">
            <div>
              <div className="react-demo__eyebrow">Live component</div>
              <h2 className="react-demo__title">Component</h2>
            </div>
            <span className="react-demo__panel-accent">useUmpire()</span>
          </div>

          <div className="react-demo__panel-body">
            <div className="react-demo__callout">
              <span className="react-demo__badge">No useEffect</span>
              <div className="react-demo__callout-copy">
                <div className="react-demo__callout-title">Pure derivation on render</div>
                <p className="react-demo__callout-text">
                  Pass current values and conditions in. Get live availability and reset guidance back.
                </p>
              </div>
            </div>

            <div className="react-demo__conditions">
              <span className="react-demo__conditions-label">Conditions</span>
              <code className="react-demo__conditions-code">{`{ plan: '${plan}' }`}</code>
            </div>

            <div className="react-demo__plan-toggle" aria-label="Plan">
              {planOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={plan === option.value}
                  className={cls(
                    'react-demo__plan-option',
                    plan === option.value && 'react-demo__plan-option--active',
                  )}
                  onClick={() => setPlan(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="react-demo__fields">
              {fieldOrder.map((field) => {
                const meta = fieldMeta[field]
                const availability = check[field]
                const fieldValue = String(values[field] ?? '')

                return (
                  <div
                    key={field}
                    className={cls(
                      'react-demo__field',
                      !availability.enabled && 'react-demo__field--disabled',
                    )}
                  >
                    <div className="react-demo__field-header">
                      <label className="react-demo__label" htmlFor={`react-demo-${field}`}>
                        {meta.label}
                      </label>

                      <div className="react-demo__chips">
                        {availability.required && (
                          <span className="react-demo__chip react-demo__chip--required">
                            required
                          </span>
                        )}
                        <span
                          className={cls(
                            'react-demo__chip',
                            availability.enabled
                              ? 'react-demo__chip--enabled'
                              : 'react-demo__chip--disabled',
                          )}
                        >
                          {availability.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </div>
                    </div>

                    <input
                      id={`react-demo-${field}`}
                      className="react-demo__input"
                      type={meta.type}
                      placeholder={meta.placeholder}
                      disabled={!availability.enabled}
                      value={fieldValue}
                      onChange={(event) => updateValue(field, event.currentTarget.value)}
                    />

                    <div className="react-demo__field-meta">
                      <code className="react-demo__field-code">check.{field}</code>
                      <span className="react-demo__field-reason">
                        {availability.reason ?? 'available'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="react-demo__note">
              Type a company name on the business plan, then switch back to personal to surface a penalty.
            </p>
          </div>
        </section>

        <section className="react-demo__panel react-demo__panel--output">
          <div className="react-demo__panel-header">
            <div>
              <div className="react-demo__eyebrow">Derived hook state</div>
              <h2 className="react-demo__title">Hook Output</h2>
            </div>
            <span className="react-demo__panel-accent">live JSON</span>
          </div>

          <div className="react-demo__panel-body react-demo__panel-body--output">
            <div className="react-demo__hook-line">
              <span className="react-demo__hook-label">Hook</span>
              <code className="react-demo__hook-code">
                {'const { check, penalties } = useUmpire(demoUmp, values, conditions)'}
              </code>
            </div>

            <section className="react-demo__json-section">
              <div className="react-demo__json-header">
                <span className="react-demo__json-title">check</span>
                <span className="react-demo__json-meta">AvailabilityMap</span>
              </div>
              <div className="react-demo__code-shell">
                <JsonBlock value={prettyJson(check)} />
              </div>
            </section>

            <section
              className={cls(
                'react-demo__json-section',
                'react-demo__json-section--penalties',
                penalties.length > 0 && 'react-demo__json-section--alert',
              )}
            >
              <div className="react-demo__json-header">
                <span className="react-demo__json-title">penalties</span>
                <span className="react-demo__json-meta">
                  {penalties.length > 0 ? 'reset recommendations' : '[]'}
                </span>
              </div>
              <div className="react-demo__code-shell">
                <JsonBlock value={penalties.length > 0 ? prettyJson(penalties) : '[]'} />
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}
