/** @jsxImportSource preact */
import { useRef } from 'preact/hooks'
import { enabledWhen, oneOf, requires, strike, umpire } from '@umpire/core'
import { register } from '@umpire/devtools/slim'
import { reactiveUmp, type ReactiveUmpire, type SignalProtocol } from '@umpire/signals'
import { computed, effect, signal } from '@preact/signals'
import '../styles/components/_components.freight-demo.css'

const fields = {
  accountType:      { required: true, default: 'personal', isEmpty: (v: unknown) => !v },
  companyName:      { isEmpty: (v: unknown) => !v },
  serviceLevel:     { required: true, default: 'standard', isEmpty: (v: unknown) => !v },
  vehicleType:      { required: true, default: 'van', isEmpty: (v: unknown) => !v },
  hazardous:        {},
  hazClass:         { isEmpty: (v: unknown) => !v },
  handlingMode:     { default: 'none', isEmpty: (v: unknown) => !v },
  blankets:         {},
  crateType:        { isEmpty: (v: unknown) => !v },
  tempRange:        { isEmpty: (v: unknown) => !v },
  humidity:         { isEmpty: (v: unknown) => !v },
  discountOverride: { isEmpty: (v: unknown) => !v },
  priceHold:        {},
}

type FreightConditions = { isAdmin: boolean; promoActive: boolean }
type FreightField = keyof typeof fields
type FieldKind = 'select' | 'checkbox' | 'text'
type Option = { value: string; label: string }

const freightUmp = umpire<typeof fields, FreightConditions>({
  fields,
  rules: [
    requires('companyName', (v) => v.accountType === 'business', {
      reason: 'Only business accounts need a company name',
    }),
    requires('hazClass', 'hazardous', {
      reason: 'Enable hazardous materials first',
    }),
    oneOf('handlingMode', {
      fragile: ['blankets', 'crateType'],
      climate: ['tempRange', 'humidity'],
    }, { activeBranch: (v) => v.handlingMode === 'none' ? null : v.handlingMode as string | null }),
    enabledWhen('discountOverride', (_v, c) => c.isAdmin, { reason: 'Admin only' }),
    enabledWhen('priceHold', (_v, c) => c.isAdmin, { reason: 'Admin only' }),
    enabledWhen('serviceLevel', (_v, c) => !c.promoActive, { reason: 'Locked by FREIGHT50 promo' }),
    enabledWhen('vehicleType', (_v, c) => !c.promoActive, { reason: 'Locked by FREIGHT50 promo' }),
  ],
})

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

const accountTypeOptions = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
] as const satisfies readonly Option[]

const serviceLevelOptions = [
  { value: 'standard', label: 'Standard' },
  { value: 'express', label: 'Express' },
  { value: 'whiteGlove', label: 'White Glove' },
] as const satisfies readonly Option[]

const vehicleTypeOptions = [
  { value: 'van', label: 'Van' },
  { value: 'truck', label: 'Truck' },
  { value: 'flatbed', label: 'Flatbed' },
] as const satisfies readonly Option[]

const hazClassOptions = [
  { value: '', label: 'Select class...' },
  { value: '1', label: 'Class 1 — Explosives' },
  { value: '2', label: 'Class 2 — Gases' },
  { value: '3', label: 'Class 3 — Flammable Liquids' },
  { value: '6', label: 'Class 6 — Toxic' },
  { value: '8', label: 'Class 8 — Corrosive' },
] as const satisfies readonly Option[]

const handlingModeOptions = [
  { value: 'none', label: 'Standard handling' },
  { value: 'fragile', label: 'Fragile' },
  { value: 'climate', label: 'Climate-controlled' },
] as const satisfies readonly Option[]

const crateTypeOptions = [
  { value: '', label: 'Select crate...' },
  { value: 'wood', label: 'Wood crate' },
  { value: 'foam', label: 'Foam-lined' },
  { value: 'custom', label: 'Custom build' },
] as const satisfies readonly Option[]

const tempRangeOptions = [
  { value: '', label: 'Select range...' },
  { value: 'frozen', label: 'Frozen (-18°C)' },
  { value: 'chilled', label: 'Chilled (2-8°C)' },
  { value: 'ambient', label: 'Ambient (15-25°C)' },
  { value: 'warm', label: 'Warm (25-35°C)' },
] as const satisfies readonly Option[]

const humidityOptions = [
  { value: '', label: 'Select humidity...' },
  { value: 'low', label: 'Low (<30%)' },
  { value: 'medium', label: 'Medium (30-60%)' },
  { value: 'high', label: 'High (>60%)' },
] as const satisfies readonly Option[]

const fieldGroups = [
  {
    label: 'Shipment',
    fields: ['accountType', 'companyName', 'serviceLevel', 'vehicleType'],
  },
  {
    label: 'Hazmat',
    fields: ['hazardous', 'hazClass'],
  },
  {
    label: 'Handling',
    fields: ['handlingMode', 'blankets', 'crateType', 'tempRange', 'humidity'],
  },
  {
    label: 'Admin',
    fields: ['discountOverride', 'priceHold'],
  },
] as const satisfies readonly {
  label: string
  fields: readonly FreightField[]
}[]

const fieldMeta: Record<
  FreightField,
  {
    label: string
    kind: FieldKind
    options?: readonly Option[]
    checkboxLabel?: string
    placeholder?: string
  }
> = {
  accountType: {
    label: 'Account Type',
    kind: 'select',
    options: accountTypeOptions,
  },
  companyName: {
    label: 'Company Name',
    kind: 'text',
    placeholder: 'Acme Logistics',
  },
  serviceLevel: {
    label: 'Service Level',
    kind: 'select',
    options: serviceLevelOptions,
  },
  vehicleType: {
    label: 'Vehicle Type',
    kind: 'select',
    options: vehicleTypeOptions,
  },
  hazardous: {
    label: 'Hazardous',
    kind: 'checkbox',
    checkboxLabel: 'Shipment contains hazardous materials',
  },
  hazClass: {
    label: 'Hazmat Class',
    kind: 'select',
    options: hazClassOptions,
  },
  handlingMode: {
    label: 'Handling Mode',
    kind: 'select',
    options: handlingModeOptions,
  },
  blankets: {
    label: 'Moving Blankets',
    kind: 'checkbox',
    checkboxLabel: 'Add protective moving blankets',
  },
  crateType: {
    label: 'Crate Type',
    kind: 'select',
    options: crateTypeOptions,
  },
  tempRange: {
    label: 'Temperature Range',
    kind: 'select',
    options: tempRangeOptions,
  },
  humidity: {
    label: 'Humidity Target',
    kind: 'select',
    options: humidityOptions,
  },
  discountOverride: {
    label: 'Discount Override',
    kind: 'text',
    placeholder: 'FLEET-10',
  },
  priceHold: {
    label: 'Price Hold',
    kind: 'checkbox',
    checkboxLabel: 'Hold this quote for 14 days',
  },
}

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function isFieldHidden(
  field: FreightField,
  values: Record<FreightField, unknown>,
  conditions: FreightConditions,
) {
  if ((field === 'discountOverride' || field === 'priceHold') && !conditions.isAdmin) {
    return true
  }

  if ((field === 'serviceLevel' || field === 'vehicleType') && conditions.promoActive) {
    return true
  }

  const handlingMode =
    values.handlingMode === 'fragile' || values.handlingMode === 'climate'
      ? values.handlingMode
      : 'none'

  if (field === 'blankets' || field === 'crateType') {
    return handlingMode !== 'fragile'
  }

  if (field === 'tempRange' || field === 'humidity') {
    return handlingMode !== 'climate'
  }

  return false
}

function FieldControl({
  field,
  reactive,
  hidden,
}: {
  field: FreightField
  reactive: ReactiveUmpire<typeof fields>
  hidden: () => boolean
}) {
  const meta = fieldMeta[field]
  const controlId = `freight-demo-${field}`
  const availability = reactive.field(field)
  const value = reactive.values[field]
  const enabled = availability.enabled
  const required = availability.required
  const reason = availability.reason
  const isHidden = hidden()
  const foul = reactive.foul(field)

  return (
    <div
      class={cls(
        'c-umpire-demo__field',
        !enabled && 'c-umpire-demo__field is-disabled',
        foul && 'c-umpire-demo__field is-fouled',
        isHidden && 'c-freight-demo__field is-hidden',
      )}
    >
      <div class="c-umpire-demo__field-header">
        <div class="c-umpire-demo__field-label">
          <label for={controlId}>{meta.label}</label>
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

      {meta.kind === 'select' && (
        <select
          id={controlId}
          class="c-umpire-demo__input"
          disabled={!enabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => reactive.set(field, event.currentTarget.value)}
        >
          {meta.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {meta.kind === 'text' && (
        <input
          id={controlId}
          class="c-umpire-demo__input"
          type="text"
          disabled={!enabled}
          placeholder={meta.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => reactive.set(field, event.currentTarget.value)}
        />
      )}

      {meta.kind === 'checkbox' && (
        <label class="c-freight-demo__checkbox-row" for={controlId}>
          <input
            id={controlId}
            type="checkbox"
            disabled={!enabled}
            checked={value === true}
            onChange={(event) => reactive.set(field, event.currentTarget.checked ? true : undefined)}
          />
          <span>{meta.checkboxLabel ?? meta.label}</span>
        </label>
      )}

      {foul && (
        <div class="c-umpire-demo__field-foul">
          <span class="c-umpire-demo__field-foul-reason">{foul.reason}</span>
          <button
            type="button"
            class="c-umpire-demo__field-foul-reset"
            onClick={() => reactive.set(field, foul.suggestedValue)}
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

function ConditionToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div class="c-umpire-demo__field">
      <div class="c-umpire-demo__field-header">
        <div class="c-umpire-demo__field-label">
          <span>{label}</span>
        </div>
        <span
          class={cls(
            'c-umpire-demo__status',
            value ? 'c-umpire-demo__status is-enabled' : 'c-umpire-demo__status is-disabled',
          )}
        >
          <span class="c-umpire-demo__status-dot" />
          <span class="c-umpire-demo__status-text">
            {value ? 'active' : 'inactive'}
          </span>
        </span>
      </div>

      <div class="c-umpire-demo__plan-toggle" aria-label={label}>
        {[
          { label: 'Off', value: false },
          { label: 'On', value: true },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={value === option.value}
            class={cls(
              'c-umpire-demo__plan-option',
              value === option.value && 'c-umpire-demo__plan-option is-active',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function FreightQuoteDemo() {
  const ref = useRef<{
    reactive: ReactiveUmpire<typeof fields>
    isAdminSignal: { value: boolean }
    promoActiveSignal: { value: boolean }
  } | null>(null)

  if (!ref.current) {
    const isAdminSignal = signal(false)
    const promoActiveSignal = signal(false)
    const reactive = reactiveUmp(freightUmp, preactAdapter, {
      conditions: {
        isAdmin: { get: () => isAdminSignal.value },
        promoActive: { get: () => promoActiveSignal.value },
      },
    })

    ref.current = {
      reactive,
      isAdminSignal,
      promoActiveSignal,
    }
  }

  const { reactive, isAdminSignal, promoActiveSignal } = ref.current

  const conditions: FreightConditions = {
    isAdmin: isAdminSignal.value,
    promoActive: promoActiveSignal.value,
  }
  const values = reactive.values
  const fouls = reactive.fouls

  // Devtools-only: this feeds the optional docs inspector and is not required
  // for the signals adapter or form logic to work.
  register('freight-quote', freightUmp, values, conditions)

  return (
    <div class="c-freight-demo c-umpire-demo">
      <div class="c-freight-demo__panel">
        <div class="c-umpire-demo__panel-header">
          <div>
            <div class="c-umpire-demo__eyebrow">Signals Adapter</div>
            <h2 class="c-umpire-demo__title">Freight Quote</h2>
          </div>
          <span class="c-umpire-demo__panel-accent">reactiveUmp()</span>
        </div>

        <div class="c-umpire-demo__panel-body">
          <div class="c-freight-demo__callout">
            <span class="c-freight-demo__badge">5 rule types</span>
            <p class="c-freight-demo__callout-text">
              Quote logic mixes predicate requirements, direct field dependencies,
              mutually exclusive handling branches, admin gating, and promo locks
              without hand-written orchestration code.
            </p>
          </div>

          <div class="c-umpire-demo__conditions">
            <span class="c-umpire-demo__conditions-label">Conditions</span>
            <code class="c-umpire-demo__conditions-code">
              {`{ isAdmin: ${conditions.isAdmin}, promoActive: ${conditions.promoActive} }`}
            </code>
          </div>

          <section class="c-freight-demo__field-group">
            <div class="c-freight-demo__group-label c-umpire-demo__eyebrow">Conditions</div>
            <div class="c-freight-demo__group-fields">
              <ConditionToggle
                label="Admin Mode"
                value={conditions.isAdmin}
                onChange={(next) => { isAdminSignal.value = next }}
              />
              <ConditionToggle
                label="FREIGHT50 Promo"
                value={conditions.promoActive}
                onChange={(next) => { promoActiveSignal.value = next }}
              />
            </div>
          </section>

          {fouls.length > 0 && (
            <div class="c-umpire-demo__fouls">
              <div class="c-umpire-demo__fouls-copy">
                <div class="c-umpire-demo__fouls-kicker">Fouls</div>
                <div class="c-umpire-demo__fouls-list">
                  {fouls.map((foul) => (
                    <div key={foul.field} class="c-umpire-demo__foul">
                      <span class="c-umpire-demo__foul-field">
                        {fieldMeta[foul.field].label}
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

          <div class="c-umpire-demo__fields">
            {fieldGroups.map((group) => {
              const visibleFields = group.fields.filter((field) => !isFieldHidden(field, values, conditions))

              if (visibleFields.length === 0) {
                return null
              }

              return (
                <section key={group.label} class="c-freight-demo__field-group">
                  <div class="c-freight-demo__group-label c-umpire-demo__eyebrow">{group.label}</div>
                  <div class="c-freight-demo__group-fields">
                    {group.fields.map((field) => (
                      <FieldControl
                        key={field}
                        field={field}
                        reactive={reactive}
                        hidden={() => isFieldHidden(field, reactive.values, {
                          isAdmin: isAdminSignal.value,
                          promoActive: promoActiveSignal.value,
                        })}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>

          <section class="c-umpire-demo__json-shell">
            <div class="c-umpire-demo__json-header">
              <span class="c-umpire-demo__json-title">signal state</span>
              <span class="c-umpire-demo__json-meta">@preact/signals</span>
            </div>
            <pre class="c-umpire-demo__code-block">
              <code>{prettyJson({ conditions, values, fouls })}</code>
            </pre>
          </section>
        </div>
      </div>
    </div>
  )
}
