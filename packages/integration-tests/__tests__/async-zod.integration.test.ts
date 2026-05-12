import { umpire, enabledWhen } from '@umpire/async'
import {
  createZodAdapter,
  deriveDiscriminatedFields,
  deriveErrors,
  deriveSchema,
  zodErrors,
} from '@umpire/zod'
import { describe, test, expect } from 'bun:test'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared schema fixtures
// ---------------------------------------------------------------------------

const paymentSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('card'),
    cardNumber: z.string().min(16),
    cvv: z.string().min(3),
  }),
  z.object({
    method: z.literal('bank'),
    routingNumber: z.string().length(9),
    accountNumber: z.string().min(8),
  }),
])

// ---------------------------------------------------------------------------

describe('async + zod integration', () => {
  // -------------------------------------------------------------------------
  // 1. Zod schema with safeParseAsync used directly as an async validator
  // -------------------------------------------------------------------------

  test('Zod safeParseAsync works as an async validator', async () => {
    const emailSchema = z.string().email()

    const ump = umpire({
      fields: { email: {}, submit: {} },
      rules: [enabledWhen('submit', async (v: any) => Boolean(v.email))],
      validators: {
        // Zod schemas have safeParseAsync — @umpire/async accepts them directly
        email: emailSchema,
      },
    })

    const valid = await ump.check({ email: 'test@example.com', submit: null })
    expect(valid.email.valid).toBe(true)
    expect(valid.email.error).toBeUndefined()

    const invalid = await ump.check({ email: 'not-an-email', submit: null })
    expect(invalid.email.valid).toBe(false)
    expect(typeof invalid.email.error).toBe('string')
  })

  test('validator with async Zod refinement runs asynchronously', async () => {
    const asyncSchema = z
      .string()
      .refine(async (v) => v !== 'taken', { message: 'Username already taken' })

    const ump = umpire({
      fields: { username: {} },
      rules: [],
      validators: { username: asyncSchema },
    })

    const ok = await ump.check({ username: 'available' })
    expect(ok.username.valid).toBe(true)

    const taken = await ump.check({ username: 'taken' })
    expect(taken.username.valid).toBe(false)
    expect(taken.username.error).toBe('Username already taken')
  })

  // -------------------------------------------------------------------------
  // 2. deriveDiscriminatedFields rule fed into async umpire()
  // -------------------------------------------------------------------------

  test('deriveDiscriminatedFields rule works with the async factory', async () => {
    const { fields, rule } = deriveDiscriminatedFields(paymentSchema, {
      groupName: 'payment',
    })

    const ump = umpire({ fields, rules: [rule] })

    const cardResult = await ump.check({ method: 'card' })
    expect(cardResult.cardNumber.enabled).toBe(true)
    expect(cardResult.cvv.enabled).toBe(true)
    expect(cardResult.routingNumber.enabled).toBe(false)
    expect(cardResult.accountNumber.enabled).toBe(false)

    const bankResult = await ump.check({ method: 'bank' })
    expect(bankResult.routingNumber.enabled).toBe(true)
    expect(bankResult.accountNumber.enabled).toBe(true)
    expect(bankResult.cardNumber.enabled).toBe(false)
    expect(bankResult.cvv.enabled).toBe(false)

    const noMethodResult = await ump.check({ method: null })
    // no branch resolved — all fields enabled
    expect(noMethodResult.cardNumber.enabled).toBe(true)
    expect(noMethodResult.routingNumber.enabled).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 3. deriveSchema on an async availability result
  // -------------------------------------------------------------------------

  test('deriveSchema accepts AvailabilityMap from async check()', async () => {
    const { fields, rule } = deriveDiscriminatedFields(paymentSchema, {
      groupName: 'payment',
    })

    const ump = umpire({ fields, rules: [rule] })
    const availability = await ump.check({ method: 'card' })

    const schema = deriveSchema(availability, {
      method: z.enum(['card', 'bank']),
      cardNumber: z.string().min(16),
      cvv: z.string().min(3),
      routingNumber: z.string().length(9),
      accountNumber: z.string().min(8),
    })

    const validCard = schema.safeParse({
      method: 'card',
      cardNumber: '4111111111111111',
      cvv: '123',
    })
    expect(validCard.success).toBe(true)

    // Disabled fields should be stripped from the derived schema
    const withBank = schema.safeParse({
      method: 'card',
      cardNumber: '4111111111111111',
      cvv: '123',
      routingNumber: '123456789',
    })
    // routingNumber is disabled so not in schema — extra keys stripped by Zod
    expect(withBank.success).toBe(true)
  })

  test('deriveSchema rejectFoul works with async availability', async () => {
    const ump = umpire({
      fields: { promoCode: {} },
      rules: [],
      validators: {
        promoCode: z.string().regex(/^SAVE\d{2}$/, 'Invalid promo code format'),
      },
    })

    const availability = await ump.check({ promoCode: 'BADCODE' })
    expect(availability.promoCode.valid).toBe(false)

    const schema = deriveSchema(
      availability,
      { promoCode: z.string() },
      { rejectFoul: false },
    )
    // field is enabled even when invalid — rejectFoul is false
    expect('promoCode' in schema.shape).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 4. createZodAdapter validators passed to async umpire()
  // -------------------------------------------------------------------------

  test('createZodAdapter.validators are accepted by the async factory', async () => {
    const fieldSchemas = {
      cardNumber: z.string().min(16, 'Card number must be 16+ digits'),
      cvv: z.string().min(3, 'CVV must be 3+ digits'),
    }

    const adapter = createZodAdapter({
      schemas: fieldSchemas,
    })

    // adapter.validators is ValidationMap<F> (sync safeParse-based).
    // @umpire/async accepts AnyValidationMap which should include sync validators.
    const ump = umpire({
      fields: { cardNumber: {}, cvv: {} },
      rules: [],
      validators: adapter.validators as any,
    })

    const result = await ump.check({
      cardNumber: '4111111111111111',
      cvv: '123',
    })
    expect(result.cardNumber.valid).toBe(true)
    expect(result.cvv.valid).toBe(true)

    const bad = await ump.check({ cardNumber: '123', cvv: '1' })
    expect(bad.cardNumber.valid).toBe(false)
    expect(bad.cardNumber.error).toBe('Card number must be 16+ digits')
    expect(bad.cvv.valid).toBe(false)
  })

  test('deriveErrors works with errors from async-validated fields', async () => {
    const { fields, rule } = deriveDiscriminatedFields(paymentSchema, {
      groupName: 'payment',
    })

    const ump = umpire({ fields, rules: [rule] })
    const availability = await ump.check({ method: 'card' })

    const schema = deriveSchema(availability, {
      method: z.enum(['card', 'bank']),
      cardNumber: z.string().min(16),
      cvv: z.string().min(3),
      routingNumber: z.string().length(9),
      accountNumber: z.string().min(8),
    })

    const result = schema.safeParse({
      method: 'card',
      cardNumber: '123',
      cvv: '1',
    })
    expect(result.success).toBe(false)
    if (result.success) return

    const errors = deriveErrors(availability, zodErrors(result.error))
    expect(typeof errors.cardNumber).toBe('string')
    expect(typeof errors.cvv).toBe('string')
    // disabled fields don't get errors surfaced
    expect(errors.routingNumber).toBeUndefined()
    expect(errors.accountNumber).toBeUndefined()
  })
})
