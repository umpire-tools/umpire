import { umpire } from '@umpire/core'
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
})
