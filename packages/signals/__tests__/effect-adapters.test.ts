import { describe, expect, test } from 'bun:test'
import { enabledWhen, umpire } from '@umpire/core'
import { alienAdapter } from '../src/adapters/alien.js'
import { vueAdapter } from '../src/adapters/vue.js'
import { reactiveUmp } from '../src/reactive.js'

const effectAdapters = [
  { name: 'alien', adapter: alienAdapter },
  { name: 'vue', adapter: vueAdapter },
] as const

describe('effect-driven adapters', () => {
  for (const { name, adapter } of effectAdapters) {
    test(`${name} tracks availability and fouls`, () => {
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

      const reactive = reactiveUmp(ump, adapter)

      reactive.update({ password: 'hunter22', confirmPassword: 'hunter22' })
      reactive.set('useSso', true)

      expect(reactive.field('password').enabled).toBe(false)
      expect(reactive.field('confirmPassword').enabled).toBe(false)
      expect(reactive.fouls.map((foul) => foul.field).sort()).toEqual([
        'confirmPassword',
        'password',
      ])
    })
  }

  test('vue uses sync watchEffect semantics with no lag', () => {
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
    expect(reactive.fouls).toEqual([])

    reactive.set('useSso', true)
    expect(reactive.fouls.map((foul) => foul.field).sort()).toEqual([
      'confirmPassword',
      'password',
    ])
  })
})
