import { describe, expect, test } from 'bun:test'
import { enabledWhen, umpire } from '@umpire/core'
import { tc39Adapter } from '../src/adapters/tc39.js'
import { reactiveUmp } from '../src/reactive.js'

describe('tc39 adapter', () => {
  test('supports availability but not fouls', () => {
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

    const reactive = reactiveUmp(ump, tc39Adapter)

    reactive.update({ password: 'hunter22', confirmPassword: 'hunter22' })
    reactive.set('useSso', true)

    expect(reactive.field('password').enabled).toBe(false)
    expect(reactive.field('confirmPassword').enabled).toBe(false)
    expect(() => reactive.foul('password')).toThrow()
    expect(() => reactive.fouls).toThrow()
  })
})
