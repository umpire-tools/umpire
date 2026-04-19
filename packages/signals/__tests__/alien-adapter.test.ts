import { describe, expect, test } from 'bun:test'
import { enabledWhen, umpire } from '@umpire/core'
import { alienAdapter } from '../src/adapters/alien.js'
import { reactiveUmp } from '../src/reactive.js'

describe('alien adapter', () => {
  test('tracks availability and fouls through real alien-signals', () => {
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

    const reactive = reactiveUmp(ump, alienAdapter)

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
