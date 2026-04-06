import { useEffect, useRef, useSyncExternalStore } from 'react'
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
  return useSyncExternalStore(
    model.umpStore.subscribe,
    () => ({
      availability: model.umpStore.getAvailability(),
      fouls: model.umpStore.fouls,
    }),
    () => ({
      availability: model.umpStore.getAvailability(),
      fouls: model.umpStore.fouls,
    }),
  )
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
    <div className="account-settings-demo__meta">
      <span
        className={cls(
          'account-settings-demo__chip',
          enabled
            ? 'account-settings-demo__chip--enabled'
            : 'account-settings-demo__chip--disabled',
        )}
      >
        {enabled ? 'enabled' : 'disabled'}
      </span>
      <span
        className={cls(
          'account-settings-demo__chip',
          required && 'account-settings-demo__chip--required',
        )}
      >
        {required ? 'required' : 'optional'}
      </span>
      <span className="account-settings-demo__reason">{reason ?? 'available'}</span>
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
    <section className="account-settings-demo__section">
      <div className="account-settings-demo__section-header">
        <div>
          <div className="account-settings-demo__section-kicker">ProfileSection</div>
          <h3 className="account-settings-demo__section-title">Owns profile fields</h3>
        </div>
        <code className="account-settings-demo__section-code">state.profile</code>
      </div>

      <div className="account-settings-demo__field-grid">
        <label className="umpire-demo__label" htmlFor="account-settings-email">
          Email
        </label>
        <input
          id="account-settings-email"
          className="umpire-demo__input"
          value={profile.email}
          onChange={(event) => patchProfile(store, { email: event.currentTarget.value })}
        />
        <FieldMeta
          enabled={availability.email.enabled}
          required={availability.email.required}
          reason={availability.email.reason}
        />

        <label className="umpire-demo__label" htmlFor="account-settings-display-name">
          Display Name
        </label>
        <input
          id="account-settings-display-name"
          className="umpire-demo__input"
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
    <section className="account-settings-demo__section">
      <div className="account-settings-demo__section-header">
        <div>
          <div className="account-settings-demo__section-kicker">PlanSection</div>
          <h3 className="account-settings-demo__section-title">Owns billing plan</h3>
        </div>
        <code className="account-settings-demo__section-code">state.billing</code>
      </div>

      <div className="umpire-demo__plan-toggle" aria-label="Billing plan">
        {(['personal', 'team'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={cls(
              'umpire-demo__plan-option',
              plan === option && 'umpire-demo__plan-option--active',
            )}
            aria-pressed={plan === option}
            onClick={() => patchBilling(store, { plan: option })}
          >
            {option}
          </button>
        ))}
      </div>

      <p className="account-settings-demo__section-note">
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
    <section className="account-settings-demo__section">
      <div className="account-settings-demo__section-header">
        <div>
          <div className="account-settings-demo__section-kicker">TeamSection</div>
          <h3 className="account-settings-demo__section-title">Owns team fields</h3>
        </div>
        <code className="account-settings-demo__section-code">state.team</code>
      </div>

      <div className="account-settings-demo__field-grid">
        <label className="umpire-demo__label" htmlFor="account-settings-team-size">
          Team Size
        </label>
        <input
          id="account-settings-team-size"
          className="umpire-demo__input"
          value={team.size}
          disabled={!availability.teamSize.enabled}
          onChange={(event) => patchTeam(store, { size: event.currentTarget.value })}
        />
        <FieldMeta
          enabled={availability.teamSize.enabled}
          required={availability.teamSize.required}
          reason={availability.teamSize.reason}
        />

        <label className="umpire-demo__label" htmlFor="account-settings-team-domain">
          Team Domain
        </label>
        <input
          id="account-settings-team-domain"
          className="umpire-demo__input"
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
    <div className="account-settings-demo umpire-demo umpire-demo--styled">
      {fouls.length > 0 && (
        <div className="umpire-demo__fouls">
          <div className="umpire-demo__fouls-copy">
            <div className="umpire-demo__fouls-kicker">Reset recommendations</div>
            <div className="umpire-demo__fouls-list">
              {fouls.map((foul) => (
                <div key={foul.field} className="umpire-demo__foul">
                  <span className="umpire-demo__foul-field">{fieldLabels[foul.field]}</span>
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

      <div className="umpire-demo__layout account-settings-demo__layout">
        <section className="umpire-demo__panel">
          <div className="umpire-demo__panel-header">
            <div>
              <div className="umpire-demo__eyebrow">Split ownership</div>
              <h2 className="umpire-demo__title">Account Settings</h2>
            </div>
            <span className="umpire-demo__panel-accent">one store, one umpire</span>
          </div>

          <div className="umpire-demo__panel-body account-settings-demo__panel-body">
            <div className="account-settings-demo__intro">
              Each section owns its own slice. `fromStore()` pulls them back together with one
              `select()` call.
            </div>

            <div className="account-settings-demo__section-stack">
              <ProfileSection store={model.store} availability={availability} />
              <PlanSection store={model.store} />
              <TeamSection store={model.store} availability={availability} />
            </div>
          </div>
        </section>

        <section className="umpire-demo__panel">
          <div className="umpire-demo__panel-header">
            <div>
              <div className="umpire-demo__eyebrow">Global reads</div>
              <h2 className="umpire-demo__title">Aggregated Output</h2>
            </div>
            <span className="umpire-demo__panel-accent">select + field()</span>
          </div>

          <div className="umpire-demo__panel-body account-settings-demo__panel-body">
            <div className="account-settings-demo__summary-grid">
              <div className="account-settings-demo__summary-card">
                <span className="account-settings-demo__summary-label">Condition</span>
                <code className="account-settings-demo__summary-code">
                  {`{ plan: '${state.billing.plan}' }`}
                </code>
              </div>
              <div className="account-settings-demo__summary-card">
                <span className="account-settings-demo__summary-label">Anywhere read</span>
                <code className="account-settings-demo__summary-code">
                  {`field('teamSize') => ${teamSizeRead.enabled ? 'enabled' : 'disabled'}`}
                </code>
              </div>
            </div>

            <div className="account-settings-demo__rules">
              <div className="account-settings-demo__rule">
                <strong>Rule 1</strong>
                <span>`teamSize` only enables on the team plan.</span>
              </div>
              <div className="account-settings-demo__rule">
                <strong>Rule 2</strong>
                <span>`teamDomain` requires `teamSize &gt; 0`.</span>
              </div>
              <div className="account-settings-demo__rule">
                <strong>Rule 3</strong>
                <span>`email` stays required regardless of which section owns it.</span>
              </div>
            </div>

            <section className="umpire-demo__json-shell">
              <div className="umpire-demo__json-header">
                <span className="umpire-demo__json-title">select(state)</span>
                <span className="umpire-demo__json-meta">InputValues</span>
              </div>
              <pre className="umpire-demo__code-block">
                <code>{JSON.stringify(selectedValues, null, 2)}</code>
              </pre>
            </section>

            <section className="umpire-demo__json-shell">
              <div className="umpire-demo__json-header">
                <span className="umpire-demo__json-title">availability</span>
                <span className="umpire-demo__json-meta">field map</span>
              </div>
              <pre className="umpire-demo__code-block">
                <code>{JSON.stringify(availability, null, 2)}</code>
              </pre>
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}
