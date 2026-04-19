import { describe, expect, it } from 'bun:test'
import { umpire } from '@umpire/core'
import { fromJson, toJson, type UmpireJsonSchema } from '@umpire/json'
import { deriveErrors, deriveSchema, zodErrors } from '@umpire/zod'
import { z } from 'zod'

describe('json + zod pipeline', () => {
  it('round-trips portable JSON into availability-aware Zod validation', () => {
    const schema: UmpireJsonSchema = {
      version: 1,
      conditions: {
        accountType: { type: 'string' },
      },
      fields: {
        accountType: {},
        displayName: { isEmpty: 'string' },
        inviteCode: { isEmpty: 'string' },
        email: { isEmpty: 'string' },
      },
      rules: [
        {
          type: 'disables',
          when: { op: 'condEq', condition: 'accountType', value: 'guest' },
          targets: ['inviteCode'],
          reason: 'Invite codes are only available for members',
        },
      ],
    }

    const parsed = fromJson(schema)
    expect(toJson(parsed)).toEqual(schema)

    const runtime = umpire(parsed)
    const guestAvailability = runtime.check({
      accountType: 'guest',
      displayName: 'Ada',
      inviteCode: 'SHOULD-NOT-MATTER',
      email: 'ada@example.com',
    }, { accountType: 'guest' })

    expect(guestAvailability.inviteCode).toMatchObject({
      enabled: false,
      required: false,
      reason: 'Invite codes are only available for members',
    })

    const derived = deriveSchema(guestAvailability, {
      accountType: z.string(),
      displayName: z.string().min(1, 'Display name is required'),
      inviteCode: z.string().min(1, 'Invite code is required'),
      email: z.string().email('Email must be valid'),
    })

    expect(derived.shape.inviteCode).toBeUndefined()

    const parseResult = derived.safeParse({
      accountType: 'guest',
      displayName: '',
      inviteCode: 'SHOULD-NOT-MATTER',
      email: 'not-an-email',
    })

    expect(parseResult.success).toBe(false)

    if (parseResult.success) {
      throw new Error('Expected derived schema parse to fail')
    }

    expect(zodErrors(parseResult.error)).toEqual([
      { field: 'displayName', message: 'Display name is required' },
      { field: 'email', message: 'Email must be valid' },
    ])

    expect(
      deriveErrors(guestAvailability, [
        { field: 'inviteCode', message: 'Invite code is required' },
        { field: 'displayName', message: 'Display name is required' },
      ]),
    ).toEqual({
      displayName: 'Display name is required',
    })
  })
})
