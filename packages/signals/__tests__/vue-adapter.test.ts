import { describe, expect, test } from 'bun:test'
import { enabledWhen, umpire } from '@umpire/core'
import { vueAdapter } from '../src/adapters/vue.js'
import { reactiveUmp } from '../src/reactive.js'

describe('vue adapter', () => {
  test('uses sync watchEffect semantics with no lag', () => {
    const ump = umpire({
      fields: {
        useSso: { default: false },
        password: { default: '' },
        confirmPassword: { default: '' },
      },
      rules: [
        enabledWhen('password', (values) => values.useSso !== true),
        enabledWhen('confirmPassword', (values) => values.useSso !== true),
        enabledWhen('confirmPassword', (values) => Boolean(values.password), {
          reason: 'Enter a password first',
        }),
      ],
    })

    const reactive = reactiveUmp(ump, vueAdapter)

    reactive.update({ password: 'hunter22', confirmPassword: 'hunter22' })
    reactive.set('useSso', true)

    expect(reactive.field('password').enabled).toBe(false)
    expect(reactive.field('confirmPassword').enabled).toBe(false)
    expect(reactive.fouls.map((foul) => foul.field).sort()).toEqual([
      'confirmPassword',
      'password',
    ])
  })
})
