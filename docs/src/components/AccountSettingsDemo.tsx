import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { enabledWhen, requires, umpire } from '@umpire/core'
import { fromStore } from '@umpire/zustand'

const fields = {
  email: { required: true, default: '', isEmpty: (v: unknown) => !v },
  displayName: { default: '', isEmpty: (v: unknown) => !v },
  teamSize: { default: '', isEmpty: (v: unknown) => !v },
  teamDomain: { default: '', isEmpty: (v: unknown) => !v },
} as const

type Plan = 'personal' | 'team'
type Conditions = { plan: Plan }
type DemoState = {
  profile: {
    email: string
    displayName: string
  }
  billing: {
    plan: Plan
  }
  team: {
    size: string
    domain: string
  }
}

type DemoModel = ReturnType<typeof createDemoModel>
type DemoField = keyof typeof fields

const fieldLabels: Record<DemoField, string> = {
  email: 'Email',
  displayName: 'Display Name',
  teamSize: 'Team Size',
  teamDomain: 'Team Domain',
}

const accountUmp = umpire<typeof fields, Conditions>({
  fields,
  rules: [
    enabledWhen('teamSize', (_values, conditions) => conditions.plan === 'team', {
      reason: 'team plan required',
    }),
    requires('teamDomain', (values) => Number(values.teamSize ?? 0) > 0, {
      reason: 'team size must be greater than 0',
    }),
  ],
})

function selectValues(state: DemoState) {
  return {
    email: state.profile.email,
    displayName: state.profile.displayName,
    teamSize: state.team.size,
    teamDomain: state.team.domain,
  }
}

function createDemoModel() {
  const store = createStore<DemoState>(() => ({
    profile: {
      email: 'alex@example.com',
      displayName: 'Alex Rivera',
    },
    billing: {
      plan: 'personal',
    },
    team: {
      size: '5',
      domain: 'stadiumops.dev',
    },
  }))

  const umpStore = fromStore(accountUmp, store, {
    select: selectValues,
    conditions: (state) => ({
      plan: state.billing.plan,
    }),
  })

  return {
    store,
    umpStore,
  }
}

function useDemoModel() {
  const modelRef = useRef<DemoModel | null>(null)

  if (!modelRef.current) {
    modelRef.current = createDemoModel()
  }

  useEffect(() => {
    return () => {
      modelRef.current?.umpStore.destroy()
    }
  }, [])

  return modelRef.current
}

function useUmpireSnapshot(model: DemoModel) {
  // Subscribing to the base store triggers re-renders when state changes.
  // umpStore caches availability and fouls against the same store, so
  // reading them here always reflects the latest values.
  useStore(model.store)
  return {
    availability: model.umpStore.getAvailability(),
    fouls: model.umpStore.fouls,
  }
}

function patchProfile(store: DemoModel['store'], patch: Partial<DemoState['profile']>) {
  store.setState((state) => ({
    ...state,
    profile: {
      ...state.profile,
      ...patch,
    },
  }))
}

function patchBilling(store: DemoModel['store'], patch: Partial<DemoState['billing']>) {
  store.setState((state) => ({
    ...state,
    billing: {
      ...state.billing,
      ...patch,
    },
  }))
}

function patchTeam(store: DemoModel['store'], patch: Partial<DemoState['team']>) {
  store.setState((state) => ({
    ...state,
    team: {
      ...state.team,
      ...patch,
    },
  }))
}

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function FieldMeta({
  enabled,
  required,
  reason,
}: {
  enabled: boolean
  required: boolean
  reason: string | null
}) {
  return (
    <div className="c-account-settings-demo__meta">
      <span
        className={cls(
          'c-account-settings-demo__chip',
          enabled
            ? 'c-account-settings-demo__chip is-enabled'
            : 'c-account-settings-demo__chip is-disabled',
        )}
      >
        {enabled ? 'enabled' : 'disabled'}
      </span>
      <span
        className={cls(
          'c-account-settings-demo__chip',
          required && 'c-account-settings-demo__chip--required',
        )}
      >
        {required ? 'required' : 'optional'}
      </span>
      <span className="c-account-settings-demo__reason">{reason ?? 'available'}</span>
    </div>
  )
}

function ProfileSection({
  store,
  availability,
}: {
  store: DemoModel['store']
  availability: ReturnType<typeof accountUmp.check>
}) {
  const profile = useStore(store, (state) => state.profile)

  return (
    <section className="c-account-settings-demo__section">
      <div className="c-account-settings-demo__section-header">
        <div>
          <div className="c-account-settings-demo__section-kicker c-umpire-demo__eyebrow">ProfileSection</div>
          <h3 className="c-account-settings-demo__section-title">Owns profile fields</h3>
        </div>
        <code className="c-account-settings-demo__section-code">state.profile</code>
      </div>

      <div className="c-account-settings-demo__field-grid">
        <label className="c-umpire-demo__label" htmlFor="account-settings-email">
          Email
        </label>
        <input
          id="account-settings-email"
          className="c-umpire-demo__input"
          value={profile.email}
          onChange={(event) => patchProfile(store, { email: event.currentTarget.value })}
        />
        <FieldMeta
          enabled={availability.email.enabled}
          required={availability.email.required}
          reason={availability.email.reason}
        />

        <label className="c-umpire-demo__label" htmlFor="account-settings-display-name">
          Display Name
        </label>
        <input
          id="account-settings-display-name"
          className="c-umpire-demo__input"
          value={profile.displayName}
          onChange={(event) => patchProfile(store, { displayName: event.currentTarget.value })}
        />
        <FieldMeta
          enabled={availability.displayName.enabled}
          required={availability.displayName.required}
          reason={availability.displayName.reason}
        />
      </div>
    </section>
  )
}

function PlanSection({ store }: { store: DemoModel['store'] }) {
  const plan = useStore(store, (state) => state.billing.plan)

  return (
    <section className="c-account-settings-demo__section">
      <div className="c-account-settings-demo__section-header">
        <div>
          <div className="c-account-settings-demo__section-kicker c-umpire-demo__eyebrow">PlanSection</div>
          <h3 className="c-account-settings-demo__section-title">Owns billing plan</h3>
        </div>
        <code className="c-account-settings-demo__section-code">state.billing</code>
      </div>

      <div className="c-umpire-demo__plan-toggle" aria-label="Billing plan">
        {(['personal', 'team'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={cls(
              'c-umpire-demo__plan-option',
              plan === option && 'c-umpire-demo__plan-option is-active',
            )}
            aria-pressed={plan === option}
            onClick={() => patchBilling(store, { plan: option })}
          >
            {option}
          </button>
        ))}
      </div>

      <p className="c-account-settings-demo__section-note">
        This section never touches team inputs directly. It only flips
        <code> plan </code>
        and Umpire handles the cross-section availability.
      </p>
    </section>
  )
}

function TeamSection({
  store,
  availability,
}: {
  store: DemoModel['store']
  availability: ReturnType<typeof accountUmp.check>
}) {
  const team = useStore(store, (state) => state.team)

  return (
    <section className="c-account-settings-demo__section">
      <div className="c-account-settings-demo__section-header">
        <div>
          <div className="c-account-settings-demo__section-kicker c-umpire-demo__eyebrow">TeamSection</div>
          <h3 className="c-account-settings-demo__section-title">Owns team fields</h3>
        </div>
        <code className="c-account-settings-demo__section-code">state.team</code>
      </div>

      <div className="c-account-settings-demo__field-grid">
        <label className="c-umpire-demo__label" htmlFor="account-settings-team-size">
          Team Size
        </label>
        <input
          id="account-settings-team-size"
          className="c-umpire-demo__input"
          value={team.size}
          disabled={!availability.teamSize.enabled}
          onChange={(event) => patchTeam(store, { size: event.currentTarget.value })}
        />
        <FieldMeta
          enabled={availability.teamSize.enabled}
          required={availability.teamSize.required}
          reason={availability.teamSize.reason}
        />

        <label className="c-umpire-demo__label" htmlFor="account-settings-team-domain">
          Team Domain
        </label>
        <input
          id="account-settings-team-domain"
          className="c-umpire-demo__input"
          value={team.domain}
          disabled={!availability.teamDomain.enabled}
          onChange={(event) => patchTeam(store, { domain: event.currentTarget.value })}
        />
        <FieldMeta
          enabled={availability.teamDomain.enabled}
          required={availability.teamDomain.required}
          reason={availability.teamDomain.reason}
        />
      </div>
    </section>
  )
}

export default function AccountSettingsDemo() {
  const model = useDemoModel()
  const state = useStore(model.store, (snapshot) => snapshot)
  const { availability, fouls } = useUmpireSnapshot(model)

  function applyResets() {
    if (fouls.length === 0) {
      return
    }

    model.store.setState((current) => {
      const next = {
        ...current,
        team: {
          ...current.team,
        },
      }

      for (const foul of fouls) {
        if (foul.field === 'teamSize') {
          next.team.size = String(foul.suggestedValue ?? '')
        }

        if (foul.field === 'teamDomain') {
          next.team.domain = String(foul.suggestedValue ?? '')
        }
      }

      return next
    })
  }

  const selectedValues = selectValues(state)
  const teamSizeRead = model.umpStore.field('teamSize')

  return (
    <div className="c-account-settings-demo c-umpire-demo">
      {fouls.length > 0 && (
        <div className="c-umpire-demo__fouls">
          <div className="c-umpire-demo__fouls-copy">
            <div className="c-umpire-demo__fouls-kicker">Reset recommendations</div>
            <div className="c-umpire-demo__fouls-list">
              {fouls.map((foul) => (
                <div key={foul.field} className="c-umpire-demo__foul">
                  <span className="c-umpire-demo__foul-field">{fieldLabels[foul.field]}</span>
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

      <div className="c-umpire-demo__layout c-account-settings-demo__layout">
        <section className="c-umpire-demo__panel">
          <div className="c-umpire-demo__panel-header">
            <div>
              <div className="c-umpire-demo__eyebrow">Split ownership</div>
              <h2 className="c-umpire-demo__title">Account Settings</h2>
            </div>
            <span className="c-umpire-demo__panel-accent">one store, one umpire</span>
          </div>

          <div className="c-umpire-demo__panel-body c-account-settings-demo__panel-body">
            <div className="c-account-settings-demo__intro">
              Each section owns its own slice. `fromStore()` pulls them back together with one
              `select()` call.
            </div>

            <div className="c-account-settings-demo__section-stack">
              <ProfileSection store={model.store} availability={availability} />
              <PlanSection store={model.store} />
              <TeamSection store={model.store} availability={availability} />
            </div>
          </div>
        </section>

        <section className="c-umpire-demo__panel">
          <div className="c-umpire-demo__panel-header">
            <div>
              <div className="c-umpire-demo__eyebrow">Global reads</div>
              <h2 className="c-umpire-demo__title">Aggregated Output</h2>
            </div>
            <span className="c-umpire-demo__panel-accent">select + field()</span>
          </div>

          <div className="c-umpire-demo__panel-body c-account-settings-demo__panel-body">
            <div className="c-account-settings-demo__summary-grid">
              <div className="c-account-settings-demo__summary-card">
                <span className="c-account-settings-demo__summary-label c-umpire-demo__eyebrow">Condition</span>
                <code className="c-account-settings-demo__summary-code">
                  {`{ plan: '${state.billing.plan}' }`}
                </code>
              </div>
              <div className="c-account-settings-demo__summary-card">
                <span className="c-account-settings-demo__summary-label c-umpire-demo__eyebrow">Anywhere read</span>
                <code className="c-account-settings-demo__summary-code">
                  {`field('teamSize') => ${teamSizeRead.enabled ? 'enabled' : 'disabled'}`}
                </code>
              </div>
            </div>

            <div className="c-account-settings-demo__rules">
              <div className="c-account-settings-demo__rule">
                <strong>Rule 1</strong>
                <span>`teamSize` only enables on the team plan.</span>
              </div>
              <div className="c-account-settings-demo__rule">
                <strong>Rule 2</strong>
                <span>`teamDomain` requires `teamSize &gt; 0`.</span>
              </div>
              <div className="c-account-settings-demo__rule">
                <strong>Rule 3</strong>
                <span>`email` stays required regardless of which section owns it.</span>
              </div>
            </div>

            <section className="c-umpire-demo__json-shell">
              <div className="c-umpire-demo__json-header">
                <span className="c-umpire-demo__json-title">select(state)</span>
                <span className="c-umpire-demo__json-meta">InputValues</span>
              </div>
              <pre className="c-umpire-demo__code-block">
                <code>{JSON.stringify(selectedValues, null, 2)}</code>
              </pre>
            </section>

            <section className="c-umpire-demo__json-shell">
              <div className="c-umpire-demo__json-header">
                <span className="c-umpire-demo__json-title">availability</span>
                <span className="c-umpire-demo__json-meta">field map</span>
              </div>
              <pre className="c-umpire-demo__code-block">
                <code>{JSON.stringify(availability, null, 2)}</code>
              </pre>
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}
