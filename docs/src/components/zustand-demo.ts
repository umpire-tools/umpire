/**
 * Vanilla Zustand + Umpire demo.
 *
 * No React. No virtual DOM. Just a Zustand store, an umpire adapter, and
 * small DOM helpers that prove the whole thing works framework-free.
 */
import { createStore } from 'zustand/vanilla'
import { enabledWhen, requires, strike, umpire } from '@umpire/core'
import { fromStore, type UmpireStore } from '@umpire/zustand'

// ---------------------------------------------------------------------------
// DOM helpers — tiny imperative utilities, not a framework.
// ---------------------------------------------------------------------------

function $(selector: string, root: Element = document.documentElement): Element | null {
  return root.querySelector(selector)
}

function $$(selector: string, root: Element = document.documentElement): Element[] {
  return [...root.querySelectorAll(selector)]
}

function setText(el: Element | null, text: string) {
  if (el) el.textContent = text
}

function setAttr(el: Element | null, attr: string, value: string | boolean) {
  if (!el) return
  if (typeof value === 'boolean') {
    if (value) el.setAttribute(attr, '')
    else el.removeAttribute(attr)
  } else {
    el.setAttribute(attr, value)
  }
}

function toggleClass(el: Element | null, cls: string, on: boolean) {
  el?.classList.toggle(cls, on)
}

// ---------------------------------------------------------------------------
// Umpire setup — identical to what you'd write in any JS environment.
// ---------------------------------------------------------------------------

const fields = {
  email:       { required: true, default: '', isEmpty: (v: unknown) => !v },
  password:    { required: true, default: '', isEmpty: (v: unknown) => !v },
  companyName: { default: '', isEmpty: (v: unknown) => !v },
  companySize: { default: '', isEmpty: (v: unknown) => !v },
}

type Cond = { plan: 'personal' | 'business' }
type DemoState = {
  email: string
  password: string
  companyName: string
  companySize: string
  plan: Cond['plan']
}

const fieldOrder = ['email', 'password', 'companyName', 'companySize'] as const
type DemoField = (typeof fieldOrder)[number]

const fieldLabels: Record<DemoField, string> = {
  email: 'Email',
  password: 'Password',
  companyName: 'Company Name',
  companySize: 'Company Size',
}

const fieldPlaceholders: Record<DemoField, string> = {
  email: 'alex@example.com',
  password: 'Choose a password',
  companyName: 'Acme Stadium Ops',
  companySize: '50 employees',
}

const demoUmp = umpire<typeof fields, Cond>({
  fields,
  rules: [
    // Company fields gate on the plan condition — an external fact, not user input.
    enabledWhen('companyName', (_v, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
    enabledWhen('companySize', (_v, cond) => cond.plan === 'business', {
      reason: 'business plan required',
    }),
    // Transitive chain: business plan → companyName filled → companySize available.
    requires('companySize', 'companyName'),
  ],
})

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mount(root: HTMLElement) {
  // -- Vanilla Zustand store. This is the source of truth. --
  const store = createStore<DemoState>(() => ({
    email: '',
    password: '',
    companyName: '',
    companySize: '',
    plan: 'personal',
  }))

  // -- Umpire adapter. Subscribes to the store, derives availability. --
  // select() picks the field values; conditions() extracts external facts.
  const umpStore = fromStore(demoUmp, store, {
    select: ({ email, password, companyName, companySize }) => ({
      email, password, companyName, companySize,
    }),
    conditions: (state) => ({ plan: state.plan }),
  })

  // -- Render initial HTML --
  root.innerHTML = renderShell()
  const foulsEl = $('.c-umpire-demo__fouls', root)!
  const foulsListEl = $('.c-umpire-demo__fouls-list', root)!
  const stateJsonEl = $('.c-zustand-demo__state-json', root)!
  const planLabelEl = $('.c-zustand-demo__plan-label', root)!
  const enabledCountEl = $('.c-zustand-demo__enabled-count', root)!

  // -- Wire input handlers → store.setState() --
  for (const field of fieldOrder) {
    const input = $(`[data-field="${field}"]`, root) as HTMLInputElement | null
    input?.addEventListener('input', () => {
      store.setState({ [field]: input.value })
    })
  }

  // -- Wire plan toggle --
  for (const btn of $$('.c-zustand-demo__plan-btn', root)) {
    btn.addEventListener('click', () => {
      const plan = btn.getAttribute('data-plan') as Cond['plan']
      store.setState({ plan })
    })
  }

  // -- Wire apply resets button --
  $('.c-umpire-demo__reset-button', root)?.addEventListener('click', () => {
    const fouls = umpStore.fouls
    const current = store.getState()
    const nextValues = strike(
      {
        email: current.email,
        password: current.password,
        companyName: current.companyName,
        companySize: current.companySize,
      },
      fouls,
    )
    store.setState(nextValues)
  })

  // -- Subscribe to store changes → update the left panel --
  store.subscribe((state) => {
    // Update input values (for when apply-resets patches the store)
    for (const field of fieldOrder) {
      const input = $(`[data-field="${field}"]`, root) as HTMLInputElement | null
      if (input && input !== document.activeElement) {
        input.value = state[field]
      }
    }

    // Update plan toggle
    for (const btn of $$('.c-zustand-demo__plan-btn', root)) {
      const isPlan = btn.getAttribute('data-plan') === state.plan
      toggleClass(btn, 'c-umpire-demo__plan-option is-active', isPlan)
      setAttr(btn, 'aria-pressed', isPlan)
    }

    // Update state JSON
    setText(stateJsonEl, JSON.stringify(state, null, 2))
    setText(planLabelEl, `${state.plan} plan`)
  })

  // -- Subscribe to umpire adapter → update the right panel --
  umpStore.subscribe((availability) => {
    const fouls = umpStore.fouls
    let enabledCount = 0

    for (const field of fieldOrder) {
      const fa = availability[field]
      const card = $(`.c-zustand-demo__field-card[data-field="${field}"]`, root)
      if (!card) continue

      toggleClass(card, 'c-zustand-demo__field-card is-disabled', !fa.enabled)

      const dot = $('.c-umpire-demo__status', card)
      toggleClass(dot, 'c-umpire-demo__status is-enabled', fa.enabled)
      toggleClass(dot, 'c-umpire-demo__status is-disabled', !fa.enabled)
      setText($('.c-umpire-demo__status-text', card), fa.enabled ? 'enabled' : 'disabled')

      const pill = $('.c-zustand-demo__pill', card)
      toggleClass(pill, 'c-zustand-demo__pill--required', fa.required)
      toggleClass(pill, 'c-zustand-demo__pill--optional', !fa.required)
      setText(pill, String(fa.required))

      setText($('.c-zustand-demo__field-reason', card), fa.reason ?? 'available')

      // Disable the input when the field is unavailable
      const input = $(`[data-field="${field}"]`, root) as HTMLInputElement | null
      if (input) input.disabled = !fa.enabled

      if (fa.enabled) enabledCount++
    }

    setText(enabledCountEl, String(enabledCount))

    // Update fouls banner — use textContent, never innerHTML with dynamic values
    toggleClass(foulsEl, 'c-umpire-demo__fouls is-visible', fouls.length > 0)
    foulsListEl.replaceChildren()
    for (const foul of fouls) {
      const row = document.createElement('div')
      row.className = 'c-umpire-demo__foul'

      const fieldSpan = document.createElement('span')
      fieldSpan.className = 'c-umpire-demo__foul-field'
      fieldSpan.textContent = fieldLabels[foul.field as DemoField] ?? foul.field

      const reasonSpan = document.createElement('span')
      reasonSpan.className = 'c-umpire-demo__foul-reason'
      reasonSpan.textContent = foul.reason

      row.append(fieldSpan, reasonSpan)
      foulsListEl.append(row)
    }
  })

  // Trigger initial render by reading current state
  const initialAvailability = umpStore.getAvailability()
  let enabledCount = 0
  for (const field of fieldOrder) {
    const fa = initialAvailability[field]
    const card = $(`.c-zustand-demo__field-card[data-field="${field}"]`, root)
    if (!card) continue
    toggleClass(card, 'c-zustand-demo__field-card is-disabled', !fa.enabled)
    const dot = $('.c-umpire-demo__status', card)
    toggleClass(dot, 'c-umpire-demo__status is-enabled', fa.enabled)
    toggleClass(dot, 'c-umpire-demo__status is-disabled', !fa.enabled)
    setText($('.c-umpire-demo__status-text', card), fa.enabled ? 'enabled' : 'disabled')
    const pill = $('.c-zustand-demo__pill', card)
    toggleClass(pill, 'c-zustand-demo__pill--required', fa.required)
    toggleClass(pill, 'c-zustand-demo__pill--optional', !fa.required)
    setText(pill, String(fa.required))
    setText($('.c-zustand-demo__field-reason', card), fa.reason ?? 'available')
    const input = $(`[data-field="${field}"]`, root) as HTMLInputElement | null
    if (input) input.disabled = !fa.enabled
    if (fa.enabled) enabledCount++
  }
  setText(enabledCountEl, String(enabledCount))
  setText(stateJsonEl, JSON.stringify(store.getState(), null, 2))
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function renderShell(): string {
  return `
    <div class="c-umpire-demo__fouls">
      <div class="c-umpire-demo__fouls-copy">
        <div class="c-umpire-demo__fouls-kicker">Reset recommendations</div>
        <div class="c-umpire-demo__fouls-list"></div>
      </div>
      <button type="button" class="c-umpire-demo__reset-button">Apply resets</button>
    </div>

    <div class="c-umpire-demo__layout">
      <section class="c-umpire-demo__panel">
        <div class="c-umpire-demo__panel-header">
          <div>
            <div class="c-umpire-demo__eyebrow">Vanilla Zustand Store</div>
            <h2 class="c-umpire-demo__title">Store State</h2>
          </div>
          <span class="c-umpire-demo__panel-accent">store.setState()</span>
        </div>

        <div class="c-umpire-demo__panel-body">
          <div class="c-zustand-demo__callout">
            <span class="c-zustand-demo__badge">no react</span>
            <p class="c-zustand-demo__callout-text">
              These inputs write to a vanilla Zustand store. Umpire subscribes
              downstream — no hooks, no effects, no framework.
            </p>
          </div>

          <div class="c-umpire-demo__plan-toggle" aria-label="Plan">
            <button type="button" class="c-umpire-demo__plan-option is-active c-zustand-demo__plan-btn" data-plan="personal" aria-pressed="true">
              Personal
            </button>
            <button type="button" class="c-umpire-demo__plan-option c-zustand-demo__plan-btn" data-plan="business" aria-pressed="false">
              Business
            </button>
          </div>

          <div class="c-umpire-demo__fields">
            ${fieldOrder.map((field) => `
              <div class="c-umpire-demo__field" data-field="${field}">
                <label class="c-umpire-demo__label" for="zustand-demo-${field}">
                  ${fieldLabels[field]}
                </label>
                <input
                  id="zustand-demo-${field}"
                  class="c-umpire-demo__input"
                  type="${field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}"
                  placeholder="${fieldPlaceholders[field]}"
                  data-field="${field}"
                />
              </div>
            `).join('')}
          </div>

          <section class="c-umpire-demo__json-shell">
            <div class="c-umpire-demo__json-header">
              <span class="c-umpire-demo__json-title">store.getState()</span>
              <span class="c-umpire-demo__json-meta c-zustand-demo__plan-label">personal plan</span>
            </div>
            <pre class="c-umpire-demo__code-block"><code class="c-zustand-demo__state-json"></code></pre>
          </section>
        </div>
      </section>

      <section class="c-umpire-demo__panel">
        <div class="c-umpire-demo__panel-header">
          <div>
            <div class="c-umpire-demo__eyebrow">Adapter Output</div>
            <h2 class="c-umpire-demo__title">Umpire Availability</h2>
          </div>
          <span class="c-umpire-demo__panel-accent">fromStore()</span>
        </div>

        <div class="c-umpire-demo__panel-body">
          <div class="c-zustand-demo__summary">
            <div class="c-zustand-demo__summary-card">
              <div class="c-zustand-demo__summary-label c-umpire-demo__eyebrow">Adapter</div>
              <code class="c-zustand-demo__summary-code">fromStore(ump, store, …)</code>
            </div>
            <div class="c-zustand-demo__summary-card">
              <div class="c-zustand-demo__summary-label c-umpire-demo__eyebrow">Enabled</div>
              <div class="c-zustand-demo__summary-value">
                <span class="c-zustand-demo__enabled-count">2</span>
                <span class="c-zustand-demo__summary-total"> / ${fieldOrder.length}</span>
              </div>
            </div>
          </div>

          <div class="c-zustand-demo__field-list">
            ${fieldOrder.map((field) => `
              <article class="c-zustand-demo__field-card" data-field="${field}">
                <div class="c-zustand-demo__field-top">
                  <div>
                    <div class="c-zustand-demo__field-name">${fieldLabels[field]}</div>
                    <code class="c-zustand-demo__field-code">field('${field}')</code>
                  </div>
                  <div class="c-umpire-demo__status">
                    <span class="c-umpire-demo__status-dot"></span>
                    <span class="c-umpire-demo__status-text">enabled</span>
                  </div>
                </div>
                <div class="c-zustand-demo__field-grid">
                  <div class="c-zustand-demo__field-cell">
                    <span class="c-zustand-demo__field-key">required</span>
                    <span class="c-zustand-demo__pill">false</span>
                  </div>
                  <div class="c-zustand-demo__field-cell c-zustand-demo__field-cell--reason">
                    <span class="c-zustand-demo__field-key">reason</span>
                    <span class="c-zustand-demo__field-reason">available</span>
                  </div>
                </div>
              </article>
            `).join('')}
          </div>

          <p class="c-zustand-demo__note">
            Fill in a company name on the business plan, then switch back to personal — a foul
            recommends clearing the stale value.
          </p>
        </div>
      </section>
    </div>
  `
}

// No auto-mount — the React shell in ZustandAdapterDemo.tsx calls mount()
// after hydration. The vanilla code has zero React dependencies.
