import { eitherOf, enabledWhen, umpire } from '@umpire/core'
import type { ReadTableInspection } from '@umpire/reads'
import { mount, register, unregister, unmount } from '../src/index.js'
import { resetRegistry } from '../src/registry.js'

const demoUmp = umpire({
  fields: {
    email: { default: '' },
  },
  rules: [],
})

function flushUi() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('Panel', () => {
  afterEach(() => {
    unregister('signup')
    unmount()
    resetRegistry()
    document.body.innerHTML = ''
  })

  it('shows current and previous conditions in the dedicated tab', async () => {
    register(
      'signup',
      demoUmp,
      { email: 'alex@example.com' },
      { plan: 'personal', sso: false },
    )

    register(
      'signup',
      demoUmp,
      { email: 'alex@acme.com' },
      { plan: 'business', sso: true },
    )

    mount()

    const host = document.getElementById('umpire-devtools')
    const root = host?.shadowRoot
    const toggle = root?.querySelector('button[aria-expanded="false"]')

    expect(toggle).not.toBeNull()

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    await flushUi()

    const conditionsTab = [...(root?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.trim().toLowerCase() === 'conditions')

    expect(conditionsTab).not.toBeNull()

    conditionsTab?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    await flushUi()

    const text = root?.textContent ?? ''

    expect(text).toContain('Current Conditions')
    expect(text).toContain('Previous Conditions')
    expect(text).toContain('business')
    expect(text).toContain('true')
    expect(text).toContain('personal')
    expect(text).toContain('false')
  })

  it('renders custom extension tabs from register options', async () => {
    register(
      'signup',
      demoUmp,
      { email: 'alex@example.com' },
      undefined,
      {
        extensions: [{
          id: 'validation',
          label: 'validation',
          inspect: () => ({
            sections: [{
              kind: 'rows',
              title: 'Summary',
              rows: [
                { label: 'status', value: 'blocked' },
                { label: 'issueCount', value: 2 },
              ],
            }],
          }),
        }],
      },
    )

    mount()

    const host = document.getElementById('umpire-devtools')
    const root = host?.shadowRoot
    const toggle = root?.querySelector('button[aria-expanded="false"]')

    expect(toggle).not.toBeNull()

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    await flushUi()

    const validationTab = [...(root?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.trim().toLowerCase() === 'validation')

    expect(validationTab).not.toBeNull()

    validationTab?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    await flushUi()

    const text = root?.textContent ?? ''

    expect(text).toContain('Summary')
    expect(text).toContain('blocked')
    expect(text).toContain('2')
  })

  it('renders reads in the dedicated reads tab', async () => {
    const inspection: ReadTableInspection<Record<string, unknown>, Record<string, unknown>> = {
      bridges: [],
      graph: {
        edges: [],
        nodes: ['status'],
      },
      nodes: {
        status: {
          dependsOnFields: ['email'],
          dependsOnReads: [],
          id: 'status',
          value: 'ok',
        },
      },
      values: {
        status: 'ok',
      },
    }

    register(
      'signup',
      demoUmp,
      { email: 'alex@example.com' },
      undefined,
      { reads: inspection },
    )

    mount({ defaultTab: 'reads' })

    const host = document.getElementById('umpire-devtools')
    const root = host?.shadowRoot
    const toggle = root?.querySelector('button[aria-expanded="false"]')

    expect(toggle).not.toBeNull()

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    await flushUi()

    const text = root?.textContent ?? ''

    expect(text).toContain('reads')
    expect(text).toContain('status')
    expect(text).toContain('ok')
  })

  it('renders named eitherOf branches in the challenge drawer', async () => {
    const authUmp = umpire({
      fields: {
        email: {},
        password: {},
        submit: {},
      },
      rules: [
        eitherOf('submitAuth', {
          sso: [
            enabledWhen('submit', () => false, {
              reason: 'No SSO available for this domain',
            }),
          ],
          password: [
            enabledWhen('submit', (values) => !!values.email, {
              reason: 'Enter a valid email address',
            }),
            enabledWhen('submit', () => false, {
              reason: 'Enter a password',
            }),
          ],
        }),
      ],
    })

    register('auth', authUmp, {
      email: '',
      password: '',
      submit: undefined,
    })

    mount()

    const host = document.getElementById('umpire-devtools')
    const root = host?.shadowRoot
    const toggle = root?.querySelector('button[aria-expanded="false"]')

    expect(toggle).not.toBeNull()

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    await flushUi()

    const submitRow = [...(root?.querySelectorAll('tr') ?? [])]
      .find((row) => row.textContent?.includes('submit'))

    expect(submitRow).not.toBeNull()

    submitRow?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    await flushUi()

    const text = root?.textContent ?? ''

    expect(text).toContain('challenge(submit)')
    expect(text).toContain('eitherOf')
    expect(text).toContain('submitAuth')
    expect(text).toContain('matchedBranches')
    expect(text).toContain('sso')
    expect(text).toContain('password')
    expect(text).toContain('No SSO available for this domain')
    expect(text).toContain('Enter a valid email address')
    expect(text).toContain('Enter a password')
    expect(text).toContain('no match')
  })
})
