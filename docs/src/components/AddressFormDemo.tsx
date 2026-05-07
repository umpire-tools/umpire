import { useForm } from '@tanstack/react-form'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { createReads, fairWhenRead } from '@umpire/reads'
import { useUmpireForm } from '@umpire/tanstack-form/react'
import { umpireFieldValidator } from '@umpire/tanstack-form'
import { register } from '@umpire/devtools/slim'

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

const addressReads = createReads({
  postalCodeFair: ({ input }) => {
    const code = String(input.postalCode ?? '').trim()
    return !code || postalCodeMatchesCountry(code, input.country)
  },
})

const addressUmp = umpire({
  fields: {
    street:     { required: true, isEmpty: (v: unknown) => !v },
    city:       { required: true, isEmpty: (v: unknown) => !v },
    country:    { required: true, isEmpty: (v: unknown) => !v },
    state:      { required: true, isEmpty: (v: unknown) => !v },
    province:   { required: true, isEmpty: (v: unknown) => !v },
    postalCode: { required: true, isEmpty: (v: unknown) => !v },
  },
  rules: [
    enabledWhen('state', (v) => v.country === 'US', {
      reason: 'Only US addresses use states',
    }),
    enabledWhen('province', (v) => v.country === 'CA', {
      reason: 'Only Canadian addresses use provinces',
    }),
    requires('state', 'country'),
    requires('province', 'country'),
    fairWhenRead('postalCode', 'postalCodeFair', addressReads, {
      reason: 'Invalid format for selected country',
    }),
  ],
})

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export default function AddressFormDemo() {
  const form = useForm({
    defaultValues: addressUmp.init(),
  })

  const umpireForm = useUmpireForm(form, addressUmp, { strike: true })

  const liveValues = form.useStore((s) => s.values)

  register('address-form', addressUmp, liveValues)

  const fouls = umpireForm.fouls

  return (
    <div class="c-address-demo c-umpire-demo">
      <div class="c-address-demo__panel">
        <div class="c-umpire-demo__panel-header">
          <div>
            <div class="c-umpire-demo__eyebrow">TanStack Form + Umpire</div>
            <h2 class="c-umpire-demo__title">Address Form</h2>
          </div>
          <span class="c-umpire-demo__panel-accent">@umpire/tanstack-form</span>
        </div>

        <div class="c-umpire-demo__panel-body">
          <div class="c-address-demo__callout">
            <span class="c-address-demo__badge">3 rule types</span>
            <p class="c-address-demo__callout-text">
              Conditional fields, country-dependent postal code validation, and automatic stale-value cleanup — all without hand-written orchestration code.
            </p>
          </div>

          {fouls.length > 0 && (
            <div class="c-umpire-demo__fouls">
              <div class="c-umpire-demo__fouls-copy">
                <div class="c-umpire-demo__fouls-kicker">Fouls</div>
                <div class="c-umpire-demo__fouls-list">
                  {fouls.map((foul) => (
                    <div key={foul.field} class="c-umpire-demo__foul">
                      <span class="c-umpire-demo__foul-field">
                        {foul.field}
                      </span>
                      <span class="c-umpire-demo__foul-reason">{foul.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div class="c-umpire-demo__fields">
            {/* Country — always visible */}
            <form.Field
              name="country"
              validators={umpireFieldValidator(addressUmp, 'country')}
            >
              {(field) => {
                const avail = umpireForm.field('country')
                return (
                  <div class="c-umpire-demo__field">
                    <div class="c-umpire-demo__field-header">
                      <div class="c-umpire-demo__field-label">
                        <label for="address-country">Country</label>
                        {avail.required && (
                          <span class="c-umpire-demo__required-pill">required</span>
                        )}
                      </div>
                      <span class="c-umpire-demo__status is-enabled">
                        <span class="c-umpire-demo__status-dot" />
                        <span class="c-umpire-demo__status-text">enabled</span>
                      </span>
                    </div>
                    <select
                      id="address-country"
                      class="c-umpire-demo__input"
                      value={String(field.state.value ?? '')}
                      onChange={(event) =>
                        field.handleChange(event.currentTarget.value)
                      }
                    >
                      {countryOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              }}
            </form.Field>

            {/* State — conditional on US */}
            {umpireForm.field('state').enabled && (
              <form.Field
                name="state"
                validators={umpireFieldValidator(addressUmp, 'state')}
              >
                {(field) => {
                  const avail = umpireForm.field('state')
                  const foul = fouls.find((f) => f.field === 'state')
                  return (
                    <div
                      class={`c-umpire-demo__field${
                        foul ? ' c-umpire-demo__field is-fouled' : ''
                      }`}
                    >
                      <div class="c-umpire-demo__field-header">
                        <div class="c-umpire-demo__field-label">
                          <label for="address-state">State</label>
                          {avail.required && (
                            <span class="c-umpire-demo__required-pill">required</span>
                          )}
                        </div>
                        <span
                          class={`c-umpire-demo__status ${
                            foul
                              ? 'c-umpire-demo__status is-fouled'
                              : 'c-umpire-demo__status is-enabled'
                          }`}
                        >
                          <span class="c-umpire-demo__status-dot" />
                          <span class="c-umpire-demo__status-text">
                            {foul ? 'fouled' : 'enabled'}
                          </span>
                        </span>
                      </div>
                      <select
                        id="address-state"
                        class="c-umpire-demo__input"
                        value={String(field.state.value ?? '')}
                        onChange={(event) =>
                          field.handleChange(event.currentTarget.value)
                        }
                      >
                        {stateOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {foul && (
                        <div class="c-umpire-demo__field-foul">
                          <span class="c-umpire-demo__field-foul-reason">
                            {foul.reason}
                          </span>
                          <button
                            type="button"
                            class="c-umpire-demo__field-foul-reset"
                            onClick={() =>
                              form.setFieldValue('state', foul.suggestedValue)
                            }
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </div>
                  )
                }}
              </form.Field>
            )}

            {/* Province — conditional on CA */}
            {umpireForm.field('province').enabled && (
              <form.Field
                name="province"
                validators={umpireFieldValidator(addressUmp, 'province')}
              >
                {(field) => {
                  const avail = umpireForm.field('province')
                  const foul = fouls.find((f) => f.field === 'province')
                  return (
                    <div
                      class={`c-umpire-demo__field${
                        foul ? ' c-umpire-demo__field is-fouled' : ''
                      }`}
                    >
                      <div class="c-umpire-demo__field-header">
                        <div class="c-umpire-demo__field-label">
                          <label for="address-province">Province</label>
                          {avail.required && (
                            <span class="c-umpire-demo__required-pill">required</span>
                          )}
                        </div>
                        <span
                          class={`c-umpire-demo__status ${
                            foul
                              ? 'c-umpire-demo__status is-fouled'
                              : 'c-umpire-demo__status is-enabled'
                          }`}
                        >
                          <span class="c-umpire-demo__status-dot" />
                          <span class="c-umpire-demo__status-text">
                            {foul ? 'fouled' : 'enabled'}
                          </span>
                        </span>
                      </div>
                      <select
                        id="address-province"
                        class="c-umpire-demo__input"
                        value={String(field.state.value ?? '')}
                        onChange={(event) =>
                          field.handleChange(event.currentTarget.value)
                        }
                      >
                        {provinceOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {foul && (
                        <div class="c-umpire-demo__field-foul">
                          <span class="c-umpire-demo__field-foul-reason">
                            {foul.reason}
                          </span>
                          <button
                            type="button"
                            class="c-umpire-demo__field-foul-reset"
                            onClick={() =>
                              form.setFieldValue('province', foul.suggestedValue)
                            }
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </div>
                  )
                }}
              </form.Field>
            )}

            {/* Street + City */}
            <div class="c-address-demo__row">
            <form.Field
              name="street"
              validators={umpireFieldValidator(addressUmp, 'street')}
            >
              {(field) => {
                const avail = umpireForm.field('street')
                return (
                  <div class="c-umpire-demo__field">
                    <div class="c-umpire-demo__field-header">
                      <div class="c-umpire-demo__field-label">
                        <label for="address-street">Street</label>
                        {avail.required && (
                          <span class="c-umpire-demo__required-pill">required</span>
                        )}
                      </div>
                      <span class="c-umpire-demo__status is-enabled">
                        <span class="c-umpire-demo__status-dot" />
                        <span class="c-umpire-demo__status-text">enabled</span>
                      </span>
                    </div>
                    <input
                      id="address-street"
                      class="c-umpire-demo__input"
                      type="text"
                      placeholder="123 Main St"
                      value={String(field.state.value ?? '')}
                      onChange={(event) =>
                        field.handleChange(event.currentTarget.value)
                      }
                    />
                  </div>
                )
              }}
            </form.Field>

            {/* City */}
            <form.Field
              name="city"
              validators={umpireFieldValidator(addressUmp, 'city')}
            >
              {(field) => {
                const avail = umpireForm.field('city')
                return (
                  <div class="c-umpire-demo__field">
                    <div class="c-umpire-demo__field-header">
                      <div class="c-umpire-demo__field-label">
                        <label for="address-city">City</label>
                        {avail.required && (
                          <span class="c-umpire-demo__required-pill">required</span>
                        )}
                      </div>
                      <span class="c-umpire-demo__status is-enabled">
                        <span class="c-umpire-demo__status-dot" />
                        <span class="c-umpire-demo__status-text">enabled</span>
                      </span>
                    </div>
                    <input
                      id="address-city"
                      class="c-umpire-demo__input"
                      type="text"
                      placeholder="Springfield"
                      value={String(field.state.value ?? '')}
                      onChange={(event) =>
                        field.handleChange(event.currentTarget.value)
                      }
                    />
                  </div>
                )
              }}
            </form.Field>
            </div>

            {/* Postal Code */}
            <form.Field
              name="postalCode"
              validators={umpireFieldValidator(addressUmp, 'postalCode')}
            >
              {(field) => {
                const avail = umpireForm.field('postalCode')
                const error = field.state.meta.errors?.[0]
                return (
                  <div class="c-umpire-demo__field">
                    <div class="c-umpire-demo__field-header">
                      <div class="c-umpire-demo__field-label">
                        <label for="address-postal">Postal Code</label>
                        {avail.required && (
                          <span class="c-umpire-demo__required-pill">required</span>
                        )}
                      </div>
                      <span class="c-umpire-demo__status is-enabled">
                        <span class="c-umpire-demo__status-dot" />
                        <span class="c-umpire-demo__status-text">enabled</span>
                      </span>
                    </div>
                    <input
                      id="address-postal"
                      class="c-umpire-demo__input"
                      type="text"
                      placeholder="12345"
                      value={String(field.state.value ?? '')}
                      onChange={(event) =>
                        field.handleChange(event.currentTarget.value)
                      }
                    />
                    {error && (
                      <div class="c-umpire-demo__field-reason">
                        {error}
                      </div>
                    )}
                  </div>
                )
              }}
            </form.Field>

            {/* Submit button */}
            <form.Subscribe selector={(state) => state.canSubmit}>
              {(canSubmit) => (
                <button
                  type="button"
                  class="c-umpire-demo__reset-button"
                  onClick={() => form.handleSubmit()}
                  disabled={!canSubmit}
                >
                  Submit
                </button>
              )}
            </form.Subscribe>
          </div>

          {/* JSON shell */}
          <section class="c-umpire-demo__json-shell">
            <div class="c-umpire-demo__json-header">
              <span class="c-umpire-demo__json-title">form state</span>
              <span class="c-umpire-demo__json-meta">@tanstack/react-form</span>
            </div>
            <pre class="c-umpire-demo__code-block">
              <code>{pretty({ values: liveValues, fouls })}</code>
            </pre>
          </section>
        </div>
      </div>
    </div>
  )
}
