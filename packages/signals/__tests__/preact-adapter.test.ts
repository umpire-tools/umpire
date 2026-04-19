import { describe, expect, test } from 'bun:test'
import { enabledWhen, umpire } from '@umpire/core'
import { preactAdapter } from '../src/adapters/preact.js'
import { reactiveUmp } from '../src/reactive.js'

describe('preact adapter', () => {
  test('wires reactiveUmp to @preact/signals-core', () => {
    const ump = umpire({
      fields: {
        useSso: { default: false },
        password: { default: '' },
        confirmPassword: { default: '' },
      },
      rules: [
        enabledWhen('confirmPassword', (values) => Boolean(values.password), {
          reason: 'Enter a password first',
        }),
        enabledWhen('password', (values) => values.useSso !== true, {
          reason: 'SSO login — no password needed',
        }),
        enabledWhen('confirmPassword', (values) => values.useSso !== true, {
          reason: 'SSO login — no password needed',
        }),
      ],
    })

    const reactive = reactiveUmp(ump, preactAdapter)

    reactive.update({
      password: 'hunter22',
      confirmPassword: 'hunter22',
    })

    expect(reactive.field('confirmPassword').enabled).toBe(true)

    reactive.set('useSso', true)

    expect(reactive.field('password').enabled).toBe(false)
    expect(reactive.field('confirmPassword').enabled).toBe(false)
    expect(reactive.fouls.map((foul) => foul.field).sort()).toEqual([
      'confirmPassword',
      'password',
    ])
  })
})
