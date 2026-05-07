import { useForm, useStore } from '@tanstack/react-form'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { createReads, fairWhenRead } from '@umpire/reads'
import { useUmpireForm } from '@umpire/tanstack-form/react'
import { umpireFieldValidator } from '@umpire/tanstack-form'
import { register } from '@umpire/devtools/slim'
import type { FieldValues, FieldsOf, Foul, NormalizeFields } from '@umpire/core'
import type { UmpireForm } from '@umpire/tanstack-form/react'
import type { ReactNode } from 'react'

const countryOptions = [
  { value: '',  label: 'Select country...' },
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'AU', label: 'Australia' },
]

const stateOptions = [
  { value: '',   label: 'Select state...' },
  { value: 'CA', label: 'California' },
  { value: 'NY', label: 'New York' },
  { value: 'TX', label: 'Texas' },
  { value: 'FL', label: 'Florida' },
]

const provinceOptions = [
  { value: '',  label: 'Select province...' },
  { value: 'ON', label: 'Ontario' },
  { value: 'QC', label: 'Quebec' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'AB', label: 'Alberta' },
]

function postalCodeMatchesCountry(code: string, country: unknown) {
  switch (country) {
    case 'US': return /^\d{5}(-\d{4})?$/.test(code)
    case 'CA': return /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(code)
    case 'UK': return /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(code)
    default: return true
  }
}

const addressFields = {
  street:     { required: true, isEmpty: (v: unknown) => !v },
  city:       { required: true, isEmpty: (v: unknown) => !v },
  country:    { required: true, isEmpty: (v: unknown) => !v },
  state:      { required: true, isEmpty: (v: unknown) => !v },
  province:   { required: true, isEmpty: (v: unknown) => !v },
  postalCode: { required: true, isEmpty: (v: unknown) => !v },
}

type AddressFieldDefs = NormalizeFields<typeof addressFields>
type AddressValues = FieldValues<AddressFieldDefs>
type AddressReads = {
  postalCodeFair: boolean
}

const addressReads = createReads<AddressValues, AddressReads>({
  postalCodeFair: ({ input }) => {
    const code = String(input.postalCode ?? '').trim()
    return !code || postalCodeMatchesCountry(code, input.country)
  },
})

const addressUmp = umpire({
  fields: addressFields,
  rules: [
    enabledWhen('state', (v) => v.country === 'US', {
      reason: 'Only US addresses use states',
    }),
    enabledWhen('province', (v) => v.country === 'CA', {
      reason: 'Only Canadian addresses use provinces',
    }),
    requires('state', 'country'),
    requires('province', 'country'),
    fairWhenRead<
      AddressFieldDefs,
      Record<string, unknown>,
      AddressReads,
      'postalCodeFair'
    >('postalCode', 'postalCodeFair', addressReads, {
      reason: 'Invalid format for selected country',
    }),
  ],
})

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function useAddressForm() {
  return useForm({
    defaultValues: addressUmp.init(),
  })
}

type AddressFields = FieldsOf<typeof addressUmp>
type AddressField = keyof AddressValues & string
type AddressFoul = Foul<AddressFields>
type AddressUmpireForm = UmpireForm<AddressFields>
type AddressForm = ReturnType<typeof useAddressForm>

type Option = {
  value: string
  label: string
}

type DemoFieldProps = {
  id: string
  label: string
  required: boolean
  foul?: AddressFoul
  error?: ReactNode
  children: ReactNode
  onReset?: (value: unknown) => void
}

function DemoStatus({ foul }: { foul?: AddressFoul }) {
  const state = foul ? 'fouled' : 'enabled'

  return (
    <span className={`c-umpire-demo__status is-${state}`}>
      <span className="c-umpire-demo__status-dot" />
      <span className="c-umpire-demo__status-text">{state}</span>
    </span>
  )
}

function DemoField({
  id,
  label,
  required,
  foul,
  error,
  children,
  onReset,
}: DemoFieldProps) {
  return (
    <div className={`c-umpire-demo__field${foul ? ' is-fouled' : ''}`}>
      <div className="c-umpire-demo__field-header">
        <div className="c-umpire-demo__field-label">
          <label htmlFor={id}>{label}</label>
          {required && (
            <span className="c-umpire-demo__required-pill">required</span>
          )}
        </div>
        <DemoStatus foul={foul} />
      </div>

      {children}

      {foul && (
        <div className="c-umpire-demo__field-foul">
          <span className="c-umpire-demo__field-foul-reason">{foul.reason}</span>
          {onReset && (
            <button
              type="button"
              className="c-umpire-demo__field-foul-reset"
              onClick={() => onReset(foul.suggestedValue)}
            >
              Reset
            </button>
          )}
        </div>
      )}

      {error && <div className="c-umpire-demo__field-reason">{error}</div>}
    </div>
  )
}

type BoundFieldProps = {
  form: AddressForm
  ump: AddressUmpireForm
  fouls: AddressFoul[]
}

type SelectFieldProps = BoundFieldProps & {
  name: AddressField
  id: string
  label: string
  options: Option[]
}

function SelectField({
  form,
  ump,
  fouls,
  name,
  id,
  label,
  options,
}: SelectFieldProps) {
  const avail = ump.field(name)
  const foul = fouls.find((item) => item.field === name)

  if (!avail.enabled) return null

  return (
    <form.Field name={name} validators={umpireFieldValidator(addressUmp, name)}>
      {(field) => (
        <DemoField
          id={id}
          label={label}
          required={avail.required}
          foul={foul}
          onReset={(value) => form.setFieldValue(name, value)}
        >
          <select
            id={id}
            className="c-umpire-demo__input"
            value={String(field.state.value ?? '')}
            onChange={(event) => field.handleChange(event.currentTarget.value)}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </DemoField>
      )}
    </form.Field>
  )
}

type TextFieldProps = BoundFieldProps & {
  name: AddressField
  id: string
  label: string
  placeholder: string
}

function TextField({
  form,
  ump,
  fouls,
  name,
  id,
  label,
  placeholder,
}: TextFieldProps) {
  const avail = ump.field(name)
  const foul = fouls.find((item) => item.field === name)

  return (
    <form.Field name={name} validators={umpireFieldValidator(addressUmp, name)}>
      {(field) => (
        <DemoField
          id={id}
          label={label}
          required={avail.required}
          foul={foul}
          error={field.state.meta.errors?.[0]}
          onReset={(value) => form.setFieldValue(name, value)}
        >
          <input
            id={id}
            className="c-umpire-demo__input"
            type="text"
            placeholder={placeholder}
            value={String(field.state.value ?? '')}
            onChange={(event) => field.handleChange(event.currentTarget.value)}
          />
        </DemoField>
      )}
    </form.Field>
  )
}

function AddressDemoIntro() {
  return (
    <div className="c-address-demo__summary">
      <div className="c-address-demo__summary-item">
        <span className="c-address-demo__summary-kicker">enables</span>
        <strong>Country gates region fields</strong>
      </div>
      <div className="c-address-demo__summary-item">
        <span className="c-address-demo__summary-kicker">validates</span>
        <strong>Postal format follows country</strong>
      </div>
      <div className="c-address-demo__summary-item">
        <span className="c-address-demo__summary-kicker">cleans</span>
        <strong>Stale values get reset suggestions</strong>
      </div>
    </div>
  )
}

function FoulsPanel({ fouls }: { fouls: AddressFoul[] }) {
  if (fouls.length === 0) return null

  return (
    <div className="c-umpire-demo__fouls">
      <div className="c-umpire-demo__fouls-copy">
        <div className="c-umpire-demo__fouls-kicker">Fouls</div>
        <div className="c-umpire-demo__fouls-list">
          {fouls.map((foul) => (
            <div key={foul.field} className="c-umpire-demo__foul">
              <span className="c-umpire-demo__foul-field">{foul.field}</span>
              <span className="c-umpire-demo__foul-reason">{foul.reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function JsonStatePanel({
  liveValues,
  fouls,
}: {
  liveValues: AddressValues
  fouls: AddressFoul[]
}) {
  return (
    <section className="c-umpire-demo__json-shell">
      <div className="c-umpire-demo__json-header">
        <span className="c-umpire-demo__json-title">form state</span>
        <span className="c-umpire-demo__json-meta">@tanstack/react-form</span>
      </div>
      <pre className="c-umpire-demo__code-block">
        <code>{pretty({ values: liveValues, fouls })}</code>
      </pre>
    </section>
  )
}

export default function AddressFormDemo() {
  const form = useAddressForm()

  const ump = useUmpireForm(form, addressUmp, { strike: true })

  const liveValues = useStore(form.store, (state) => state.values)

  register('address-form', addressUmp, liveValues)

  const fouls = ump.fouls

  return (
    <div className="c-address-demo c-umpire-demo">
      <div className="c-address-demo__panel">
        <div className="c-umpire-demo__panel-header">
          <div>
            <div className="c-umpire-demo__eyebrow">TanStack Form + Umpire</div>
            <h2 className="c-umpire-demo__title">Address Form</h2>
          </div>
          <span className="c-umpire-demo__panel-accent">@umpire/tanstack-form</span>
        </div>

        <div className="c-umpire-demo__panel-body">
          <AddressDemoIntro />
          <FoulsPanel fouls={fouls} />

          <div className="c-umpire-demo__fields">
            <SelectField
              form={form}
              ump={ump}
              fouls={fouls}
              name="country"
              id="address-country"
              label="Country"
              options={countryOptions}
            />

            <SelectField
              form={form}
              ump={ump}
              fouls={fouls}
              name="state"
              id="address-state"
              label="State"
              options={stateOptions}
            />

            <SelectField
              form={form}
              ump={ump}
              fouls={fouls}
              name="province"
              id="address-province"
              label="Province"
              options={provinceOptions}
            />

            <div className="c-address-demo__row">
              <TextField
                form={form}
                ump={ump}
                fouls={fouls}
                name="street"
                id="address-street"
                label="Street"
                placeholder="123 Main St"
              />
              <TextField
                form={form}
                ump={ump}
                fouls={fouls}
                name="city"
                id="address-city"
                label="City"
                placeholder="Springfield"
              />
            </div>

            <TextField
              form={form}
              ump={ump}
              fouls={fouls}
              name="postalCode"
              id="address-postal"
              label="Postal Code"
              placeholder="12345"
            />

            <form.Subscribe selector={(state) => state.canSubmit}>
              {(canSubmit) => (
                <button
                  type="button"
                  className="c-umpire-demo__reset-button"
                  onClick={() => form.handleSubmit()}
                  disabled={!canSubmit}
                >
                  Submit
                </button>
              )}
            </form.Subscribe>
          </div>

          <JsonStatePanel liveValues={liveValues} fouls={fouls} />
        </div>
      </div>
    </div>
  )
}
