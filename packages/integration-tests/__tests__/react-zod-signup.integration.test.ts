import { renderHook } from '@testing-library/react'
import { enabledWhen, fairWhen, requires, type FieldDef, umpire } from '@umpire/core'
import { createZodAdapter } from '@umpire/zod'
import { z } from 'zod'
import { useUmpire } from '@umpire/react'
import { describe, it, expect } from 'bun:test'

describe('react + zod signup flow', () => {
  const fields = {
    email: { default: '' },
    password: { default: '' },
    confirmPassword: { default: '' },
  } satisfies Record<string, FieldDef>

  const validation = createZodAdapter({
    schemas: {
      email: z.string().email('Enter a valid email'),
      password: z.string().min(8, 'At least 8 characters'),
      confirmPassword: z.string(),
    },
    build(baseSchema) {
      return baseSchema.superRefine((data, ctx) => {
        if (data.email === 'filter@example.com') {
          ctx.addIssue({ code: 'custom', path: ['password'], message: 'Password is not needed for SSO' })
        }

        if (data.confirmPassword !== data.password) {
          ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' })
        }
      })
    },
    rejectFoul: true,
  })

  const signupUmp = umpire({
    fields,
    rules: [
      requires('confirmPassword', 'password'),
      fairWhen('confirmPassword', (confirmPassword, values) => confirmPassword === values.password, {
        reason: 'Passwords do not match',
      }),
      enabledWhen('password', (_values, conditions) => !conditions.sso),
      enabledWhen('confirmPassword', (_values, conditions) => !conditions.sso),
    ],
  })

  it('disables password fields on SSO and filters disabled-field errors', () => {
    const { result, rerender } = renderHook(
      ({ values, conditions }) => useUmpire(signupUmp, values, conditions),
      {
        initialProps: {
          values: { email: 'user@example.com', password: 'hunter22', confirmPassword: 'hunter22' },
          conditions: { sso: false },
        },
      },
    )

    rerender({
      values: { email: 'filter@example.com', password: 'hunter22', confirmPassword: 'hunter22' },
      conditions: { sso: true },
    })

    expect(result.current.check.password.enabled).toBe(false)
    expect(result.current.check.confirmPassword.enabled).toBe(false)
    expect(result.current.fouls.map((foul) => foul.field).sort()).toEqual(['confirmPassword', 'password'])

    const parsed = validation.run(result.current.check, {
      email: 'filter@example.com',
      password: 'hunter22',
      confirmPassword: 'hunter22',
    })

    expect(parsed.result.success).toBe(false)
    expect(parsed.errors).toEqual({})
  })

  it('rejects stale mismatched confirm password when rejectFoul is on', () => {
    const { result, rerender } = renderHook(
      ({ values, conditions }) => useUmpire(signupUmp, values, conditions),
      {
        initialProps: {
          values: { email: 'user@example.com', password: 'hunter22', confirmPassword: 'hunter22' },
          conditions: { sso: false },
        },
      },
    )

    rerender({
      values: { email: 'user@example.com', password: 'hunter22', confirmPassword: 'mismatch' },
      conditions: { sso: false },
    })

    const parsed = validation.run(result.current.check, {
      email: 'user@example.com',
      password: 'hunter22',
      confirmPassword: 'mismatch',
    })

    expect(result.current.check.confirmPassword.enabled).toBe(true)
    expect(result.current.fouls).toHaveLength(1)
    expect(result.current.fouls[0]?.field).toBe('confirmPassword')
    expect(parsed.result.success).toBe(false)
    expect(parsed.errors).toEqual({ confirmPassword: 'Passwords do not match' })
  })
})
