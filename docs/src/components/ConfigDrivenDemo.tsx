import { useMemo, useState } from 'react'
import { strike, umpire } from '@umpire/core'
import type { FieldDef, InputValues, Umpire } from '@umpire/core'
import { fromJsonSafe } from '@umpire/json'
import type { JsonRule, UmpireJsonSchema } from '@umpire/json'
import { useUmpire } from '@umpire/react'
import '../styles/components/_components.config-driven-demo.css'

// The schema the demo loads with. Two `enabledWhen` branches (accountType →
// company fields, country → state) plus a portable `email` validator —
// enough to exercise the rule, validator, and schema-rejection paths.
const seedSchema: UmpireJsonSchema = {
  version: 1,
  fields: {
    accountType: { required: true, isEmpty: 'string' },
    email:       { required: true, isEmpty: 'string' },
    companyName: { required: true, isEmpty: 'string' },
    taxId:       { required: true, isEmpty: 'string' },
    country:     { required: true, isEmpty: 'string' },
    state:       { required: true, isEmpty: 'string' },
  },
  rules: [
    {
      type: 'enabledWhen',
      field: 'companyName',
      when: { op: 'eq', field: 'accountType', value: 'business' },
      reason: 'Business accounts only',
    },
    {
      type: 'enabledWhen',
      field: 'taxId',
      when: { op: 'eq', field: 'accountType', value: 'business' },
      reason: 'Business accounts only',
    },
    {
      type: 'enabledWhen',
      field: 'state',
      when: { op: 'eq', field: 'country', value: 'US' },
      reason: 'US addresses only',
    },
  ],
  validators: {
    email: { op: 'email', error: 'Enter a valid email address' },
  },
}

const seedJson = JSON.stringify(seedSchema, null, 2)

type FieldMeta = {
  label: string
  placeholder?: string
  inputType?: 'text' | 'email' | 'select'
  options?: Array<{ value: string; label: string }>
}

// Labels, placeholders, and input types live on the renderer side. Umpire
// owns behavior (enabled / required / valid) and this map owns presentation.
// Fields that aren't listed here fall through `metaFor()` to a plain text
// input, so adding a field to the schema doesn't require editing this file.
const fieldMeta: Record<string, FieldMeta> = {
  accountType: {
    label: 'Account type',
    inputType: 'select',
    options: [
      { value: 'individual', label: 'Individual' },
      { value: 'business',   label: 'Business' },
    ],
  },
  email:       { label: 'Email',        placeholder: 'alex@example.com', inputType: 'email' },
  companyName: { label: 'Company name', placeholder: 'Acme Corporation' },
  taxId:       { label: 'Tax ID',       placeholder: 'e.g. 12-3456789' },
  country: {
    label: 'Country',
    inputType: 'select',
    options: [
      { value: 'US',    label: 'United States' },
      { value: 'CA',    label: 'Canada' },
      { value: 'Other', label: 'Elsewhere' },
    ],
  },
  state:         { label: 'State',            placeholder: 'CA' },
  billingEmail:  { label: 'Billing contact',  placeholder: 'billing@acme.com', inputType: 'email' },
}

function metaFor(field: string): FieldMeta {
  return fieldMeta[field] ?? { label: field, placeholder: `Enter ${field}` }
}

// ── Mutations: one-click schema edits wired to the prompt buttons ──────────
//
// Each mutation is idempotent: `apply()` produces the mutated schema and
// `isApplied()` reports whether the current schema already reflects it, so
// the same button can be disabled once its effect is visible.

type Mutation = {
  id: string
  label: string
  blurb: string
  tone: 'add' | 'swap' | 'break'
  apply: (schema: UmpireJsonSchema) => UmpireJsonSchema
  isApplied: (schema: UmpireJsonSchema) => boolean
}

const addBillingContactRule: JsonRule = {
  type: 'enabledWhen',
  field: 'billingEmail',
  when: { op: 'eq', field: 'accountType', value: 'business' },
  reason: 'Business accounts only',
}

const mutations: Mutation[] = [
  {
    id: 'add-rule',
    label: '+ Add a rule',
    tone: 'add',
    blurb: 'Wire a billing contact to the business branch.',
    apply(schema) {
      if (schema.fields.billingEmail) return schema
      return {
        ...schema,
        fields: {
          ...schema.fields,
          billingEmail: { required: true, isEmpty: 'string' },
        },
        rules: [...schema.rules, addBillingContactRule],
      }
    },
    isApplied(schema) {
      return Boolean(schema.fields.billingEmail)
    },
  },
  {
    id: 'swap-validator',
    label: '↻ Swap a validator',
    tone: 'swap',
    blurb: 'Restrict email to the @umpire.co domain.',
    apply(schema) {
      return {
        ...schema,
        validators: {
          ...schema.validators,
          email: {
            op: 'matches',
            pattern: '@umpire\\.co$',
            error: 'Must be an @umpire.co address',
          },
        },
      }
    },
    isApplied(schema) {
      return schema.validators?.email?.op === 'matches'
    },
  },
  {
    id: 'break-it',
    label: '⚠ Break it',
    tone: 'break',
    blurb: 'Introduce an op the schema can\u2019t serialize.',
    apply(schema) {
      return {
        ...schema,
        rules: schema.rules.map((rule) => {
          if (rule.type === 'enabledWhen' && rule.field === 'state') {
            return {
              ...rule,
              when: { op: 'eqIgnoreCase', field: 'country', value: 'US' } as unknown as typeof rule.when,
            }
          }
          return rule
        }),
      }
    },
    isApplied(schema) {
      return schema.rules.some((rule) =>
        rule.type === 'enabledWhen' &&
        rule.field === 'state' &&
        (rule.when as { op?: unknown })?.op === 'eqIgnoreCase',
      )
    },
  },
]

// ── Parse attempt ───────────────────────────────────────────────────────────

type ParseAttempt =
  | { status: 'ok'; schema: UmpireJsonSchema; ump: Umpire<Record<string, FieldDef>, Record<string, unknown>>; fieldOrder: string[] }
  | { status: 'error'; error: string }

function parseAttempt(text: string): ParseAttempt {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { status: 'error', error: `JSON parse error: ${(error as Error).message}` }
  }

  const parsed = fromJsonSafe(raw)

  if (!parsed.ok) {
    return { status: 'error', error: parsed.errors.join('\n') }
  }

  const ump = umpire({ fields: parsed.fields, rules: parsed.rules, validators: parsed.validators })
  const fieldOrder = Object.keys(parsed.schema.fields)
  return { status: 'ok', schema: parsed.schema, ump, fieldOrder }
}

function cls(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ConfigDrivenDemo() {
  const [jsonText, setJsonText] = useState(seedJson)
  const parse = useMemo(() => parseAttempt(jsonText), [jsonText])

  function replaceSchema(next: UmpireJsonSchema) {
    setJsonText(JSON.stringify(next, null, 2))
  }

  function resetSeed() {
    setJsonText(seedJson)
  }

  const appliedMutations = parse.status === 'ok'
    ? mutations.filter((m) => m.isApplied(parse.schema))
    : []

  return (
    <div className="c-umpire-demo c-config-demo">
      <div className="c-config-demo__prompts">
        <div className="c-config-demo__prompts-header">
          <span className="c-umpire-demo__eyebrow">Try this</span>
          <button
            type="button"
            className="c-config-demo__reset"
            onClick={resetSeed}
            disabled={jsonText === seedJson}
          >
            Reset JSON
          </button>
        </div>
        <div className="c-config-demo__prompts-list">
          {mutations.map((mutation) => {
            const applied = parse.status === 'ok' && mutation.isApplied(parse.schema)
            return (
              <button
                key={mutation.id}
                type="button"
                className={cls(
                  'c-config-demo__prompt',
                  `c-config-demo__prompt--${mutation.tone}`,
                  applied && 'is-applied',
                )}
                onClick={() => {
                  if (parse.status !== 'ok') return
                  replaceSchema(mutation.apply(parse.schema))
                }}
                disabled={parse.status !== 'ok' || applied}
              >
                <span className="c-config-demo__prompt-label">{mutation.label}</span>
                <span className="c-config-demo__prompt-blurb">{mutation.blurb}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="c-umpire-demo__layout c-config-demo__layout">
        <section className="c-umpire-demo__panel c-config-demo__panel--json">
          <div className="c-umpire-demo__panel-header">
            <div>
              <div className="c-umpire-demo__eyebrow">Portable schema</div>
              <h2 className="c-umpire-demo__title">schema.json</h2>
            </div>
            <span className="c-umpire-demo__panel-accent">
              {parse.status === 'ok' ? `v${parse.schema.version} · editable` : 'rejected'}
            </span>
          </div>
          <div className="c-umpire-demo__panel-body c-config-demo__panel-body--json">
            <textarea
              className="c-config-demo__editor"
              value={jsonText}
              spellCheck={false}
              onChange={(event) => setJsonText(event.currentTarget.value)}
              aria-label="Umpire schema JSON"
            />
            {appliedMutations.length > 0 && (
              <div className="c-config-demo__applied">
                {appliedMutations.map((mutation) => (
                  <span
                    key={mutation.id}
                    className={cls('c-config-demo__applied-pill', `c-config-demo__applied-pill--${mutation.tone}`)}
                  >
                    {mutation.label.replace(/^[+↻⚠]\s*/, '')}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="c-umpire-demo__panel c-config-demo__panel--form">
          {parse.status === 'ok' ? (
            <LiveForm parse={parse} />
          ) : (
            <SchemaRejected error={parse.error} onReset={resetSeed} />
          )}
        </section>
      </div>
    </div>
  )
}

// ── Form (only mounts when the schema parses) ───────────────────────────────

type LiveFormProps = {
  parse: Extract<ParseAttempt, { status: 'ok' }>
}

function initValuesFrom(fieldOrder: string[]): InputValues {
  const values: Record<string, unknown> = {}
  for (const field of fieldOrder) {
    values[field] = ''
  }
  return values
}

function LiveForm({ parse }: LiveFormProps) {
  const { ump, fieldOrder } = parse
  // Key the values to the fieldOrder signature so adding a field resets state
  // *only when field identity changes* — validator swaps carry values through.
  const signature = fieldOrder.join('|')
  return <LiveFormInner key={signature} ump={ump} fieldOrder={fieldOrder} />
}

type LiveFormInnerProps = {
  ump: Umpire<Record<string, FieldDef>, Record<string, unknown>>
  fieldOrder: string[]
}

function LiveFormInner({ ump, fieldOrder }: LiveFormInnerProps) {
  const [values, setValues] = useState<InputValues>(() => initValuesFrom(fieldOrder))
  const { check, fouls } = useUmpire(ump, values)

  function setField(field: string, next: string) {
    setValues((current) => ({ ...current, [field]: next }))
  }

  function applyResets() {
    setValues((current) => strike(current, fouls))
  }

  const allRequired = fieldOrder.filter((field) => check[field]?.required)
  const availableRequired = allRequired.filter((field) => check[field]?.enabled)
  const satisfiedCount = availableRequired.filter(
    (field) => check[field]?.satisfied,
  ).length

  return (
    <>
      <div className="c-umpire-demo__panel-header">
        <div>
          <div className="c-umpire-demo__eyebrow">Rendered form</div>
          <h2 className="c-umpire-demo__title">generic.tsx</h2>
        </div>
        <span className="c-umpire-demo__panel-accent">
          {satisfiedCount}/{availableRequired.length} required
        </span>
      </div>
      <div className="c-umpire-demo__panel-body c-config-demo__panel-body--form">
        {fouls.length > 0 && (
          <div className="c-umpire-demo__fouls c-config-demo__fouls">
            <div className="c-umpire-demo__fouls-copy">
              <div className="c-umpire-demo__fouls-kicker">Flag fouls</div>
              <div className="c-umpire-demo__fouls-list">
                {fouls.map((foul) => (
                  <div key={String(foul.field)} className="c-umpire-demo__foul">
                    <span className="c-umpire-demo__foul-field">{metaFor(String(foul.field)).label}</span>
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

        <div className="c-umpire-demo__fields">
          {fieldOrder.map((field) => {
            const meta = metaFor(field)
            const av = check[field]
            if (!av) return null
            const value = typeof values[field] === 'string' ? (values[field] as string) : ''
            const showValidator = av.enabled && av.valid === false && value.length > 0

            return (
              <div
                key={field}
                className={cls(
                  'c-umpire-demo__field',
                  !av.enabled && 'is-disabled',
                )}
              >
                <div className="c-umpire-demo__field-header">
                  <span className="c-umpire-demo__field-label">
                    {meta.label}
                    {av.required && <span className="c-config-demo__required">*</span>}
                  </span>
                  <FieldBadge enabled={av.enabled} required={av.required} />
                </div>
                {meta.inputType === 'select' ? (
                  <select
                    className="c-umpire-demo__input"
                    value={value}
                    disabled={!av.enabled}
                    onChange={(event) => setField(field, event.currentTarget.value)}
                  >
                    <option value="">Select…</option>
                    {meta.options?.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="c-umpire-demo__input"
                    type={meta.inputType ?? 'text'}
                    placeholder={meta.placeholder}
                    value={value}
                    disabled={!av.enabled}
                    onChange={(event) => setField(field, event.currentTarget.value)}
                  />
                )}
                {!av.enabled && av.reason && (
                  <div className="c-config-demo__field-note c-config-demo__field-note--disabled">
                    {av.reason}
                  </div>
                )}
                {showValidator && (
                  <div className="c-config-demo__field-note c-config-demo__field-note--invalid">
                    {av.error ?? av.reason ?? 'Invalid value'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <UmpireCall check={check} fieldOrder={fieldOrder} />
      </div>
    </>
  )
}

// ── Umpire's Call: per-field trace derived from the current check() result ─

type UmpireCallProps = {
  check: ReturnType<Umpire<Record<string, FieldDef>, Record<string, unknown>>['check']>
  fieldOrder: string[]
}

function UmpireCall({ check, fieldOrder }: UmpireCallProps) {
  const rows = fieldOrder.map((field) => {
    const av = check[field]
    if (!av) return null
    // Verdicts mirror Umpire's own `check()` fields in priority order: a
    // disabled field is out of play entirely, a foul ball (fairWhen failure)
    // ranks next, and only then do we look at validator results.
    let verdict: 'in-play' | 'out' | 'foul' | 'invalid' = 'in-play'
    let copy = av.required ? 'in play · required' : 'in play'
    if (!av.enabled) {
      verdict = 'out'
      copy = av.reason ?? 'out of play'
    } else if (!av.fair) {
      verdict = 'foul'
      copy = av.reason ?? 'foul — value fails a fairness rule'
    } else if (av.valid === false) {
      verdict = 'invalid'
      copy = av.error ?? av.reason ?? 'fails validator'
    }
    return { field, verdict, copy }
  }).filter((row): row is { field: string; verdict: 'in-play' | 'out' | 'foul' | 'invalid'; copy: string } => row !== null)

  return (
    <div className="c-config-demo__call">
      <div className="c-config-demo__call-header">
        <span className="c-umpire-demo__eyebrow">Umpire&rsquo;s call</span>
        <span className="c-config-demo__call-hint">live derivation of the current schema</span>
      </div>
      <ul className="c-config-demo__call-list">
        {rows.map((row) => (
          <li key={row.field} className={cls('c-config-demo__call-row', `c-config-demo__call-row--${row.verdict}`)}>
            <span className="c-config-demo__call-field">{row.field}</span>
            <span className="c-config-demo__call-verdict">{row.verdict.replace('-', ' ')}</span>
            <span className="c-config-demo__call-copy">{row.copy}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Field badge ─────────────────────────────────────────────────────────────

function FieldBadge({ enabled, required }: { enabled: boolean; required: boolean }) {
  if (!enabled) {
    return <span className="c-umpire-demo__status is-disabled"><span className="c-umpire-demo__status-dot" />out</span>
  }
  if (required) {
    return <span className="c-umpire-demo__status is-enabled"><span className="c-umpire-demo__status-dot" />required</span>
  }
  return <span className="c-umpire-demo__status is-enabled"><span className="c-umpire-demo__status-dot" />in play</span>
}

// ── Schema rejected ─────────────────────────────────────────────────────────

function SchemaRejected({ error, onReset }: { error: string; onReset: () => void }) {
  return (
    <>
      <div className="c-umpire-demo__panel-header">
        <div>
          <div className="c-umpire-demo__eyebrow">Schema rejected</div>
          <h2 className="c-umpire-demo__title">validateSchema()</h2>
        </div>
        <span className="c-umpire-demo__panel-accent">safe by default</span>
      </div>
      <div className="c-umpire-demo__panel-body c-config-demo__panel-body--error">
        <p className="c-config-demo__error-lead">
          The edit you made isn&rsquo;t expressible in the portable contract. No partial umpire was built.
        </p>
        <pre className="c-config-demo__error-pre">{error}</pre>
        <button type="button" className="c-umpire-demo__reset-button" onClick={onReset}>
          Restore seed JSON
        </button>
      </div>
    </>
  )
}
