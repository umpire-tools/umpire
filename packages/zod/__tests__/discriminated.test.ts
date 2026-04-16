import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { umpire } from '@umpire/core'
import { deriveOneOf, deriveDiscriminatedFields } from '../src/discriminated.js'

const paymentSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('card'),
    cardNumber: z.string(),
    cvv: z.string(),
  }),
  z.object({
    method: z.literal('bank'),
    routingNumber: z.string(),
    accountNumber: z.string(),
  }),
])

describe('deriveOneOf', () => {
  test('returns a rule function from a two-variant discriminated union', () => {
    const rule = deriveOneOf(paymentSchema, { groupName: 'payment' })
    expect(typeof rule).toBe('object')
    expect(rule.type).toBe('oneOf')
  })

  test('end-to-end: setting discriminator hides other branch fields', () => {
    const rule = deriveOneOf(paymentSchema, { groupName: 'payment' })

    const u = umpire({
      fields: {
        method: { required: true },
        cardNumber: { required: true },
        cvv: { required: true },
        routingNumber: { required: true },
        accountNumber: { required: true },
      },
      rules: [rule],
    })

    const withCard = u.check({ method: 'card' })
    expect(withCard.cardNumber.enabled).toBe(true)
    expect(withCard.cvv.enabled).toBe(true)
    expect(withCard.routingNumber.enabled).toBe(false)
    expect(withCard.accountNumber.enabled).toBe(false)

    const withBank = u.check({ method: 'bank' })
    expect(withBank.routingNumber.enabled).toBe(true)
    expect(withBank.accountNumber.enabled).toBe(true)
    expect(withBank.cardNumber.enabled).toBe(false)
    expect(withBank.cvv.enabled).toBe(false)
  })

  test('all branch fields enabled when discriminator is not set', () => {
    const rule = deriveOneOf(paymentSchema, { groupName: 'payment' })

    const u = umpire({
      fields: {
        method: { required: true },
        cardNumber: { required: true },
        cvv: { required: true },
        routingNumber: { required: true },
        accountNumber: { required: true },
      },
      rules: [rule],
    })

    const initial = u.check({})
    expect(initial.cardNumber.enabled).toBe(true)
    expect(initial.cvv.enabled).toBe(true)
    expect(initial.routingNumber.enabled).toBe(true)
    expect(initial.accountNumber.enabled).toBe(true)
  })
})

describe('deriveDiscriminatedFields', () => {
  test('fields contain all variant keys plus discriminator', () => {
    const { fields } = deriveDiscriminatedFields(paymentSchema, {
      groupName: 'payment',
    })

    expect(Object.keys(fields).sort()).toEqual(
      ['accountNumber', 'cardNumber', 'cvv', 'method', 'routingNumber'].sort(),
    )
    expect(fields.method.required).toBe(true)
  })

  test('required inference: optional Zod fields produce required false', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({
        type: z.literal('a'),
        requiredField: z.string(),
        optionalField: z.string().optional(),
      }),
      z.object({
        type: z.literal('b'),
        anotherField: z.number(),
      }),
    ])

    const { fields } = deriveDiscriminatedFields(schema, {
      groupName: 'test',
    })

    expect(fields.requiredField.required).toBe(true)
    expect(fields.optionalField.required).toBe(false)
    expect(fields.anotherField.required).toBe(true)
  })

  test('required override: all non-discriminator fields become required', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({
        type: z.literal('a'),
        optField: z.string().optional(),
      }),
      z.object({
        type: z.literal('b'),
        otherField: z.number(),
      }),
    ])

    const { fields } = deriveDiscriminatedFields(schema, {
      groupName: 'test',
      required: true,
    })

    expect(fields.optField.required).toBe(true)
    expect(fields.otherField.required).toBe(true)
    expect(fields.type.required).toBe(true)
  })

  test('exclude removes keys from fields and branch arrays', () => {
    const { fields, rule } = deriveDiscriminatedFields(paymentSchema, {
      groupName: 'payment',
      exclude: ['cvv'],
    })

    expect(fields.cvv).toBeUndefined()

    const u = umpire({
      fields: {
        method: { required: true },
        cardNumber: { required: true },
        routingNumber: { required: true },
        accountNumber: { required: true },
      },
      rules: [rule],
    })

    const withCard = u.check({ method: 'card' })
    expect(withCard.cardNumber.enabled).toBe(true)
  })

  test('branchNames remaps discriminator literal values', () => {
    const { rule } = deriveDiscriminatedFields(paymentSchema, {
      groupName: 'payment',
      branchNames: { card: 'creditCard', bank: 'bankTransfer' },
    })

    const u = umpire({
      fields: {
        method: { required: true },
        cardNumber: { required: true },
        cvv: { required: true },
        routingNumber: { required: true },
        accountNumber: { required: true },
      },
      rules: [rule],
    })

    const withCard = u.check({ method: 'creditCard' })
    expect(withCard.cardNumber.enabled).toBe(true)
    expect(withCard.cvv.enabled).toBe(true)
    expect(withCard.routingNumber.enabled).toBe(false)
    expect(withCard.accountNumber.enabled).toBe(false)
  })

  test('branchNames with exclude: fields correctly derived when both options used', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('a'),
        fieldA: z.string(),
        commonField: z.string(),
      }),
      z.object({
        kind: z.literal('b'),
        fieldB: z.number(),
        commonField: z.string(),
      }),
    ])

    const { fields, rule } = deriveDiscriminatedFields(schema, {
      groupName: 'combined',
      branchNames: { a: 'typeA', b: 'typeB' },
      exclude: ['commonField'],
    })

    // Verify commonField is excluded
    expect(fields.commonField).toBeUndefined()
    // Verify other fields are present
    expect(fields.fieldA.required).toBe(true)
    expect(fields.fieldB.required).toBe(true)
    expect(fields.kind.required).toBe(true)

    // Verify the rule works end-to-end with the remapped branch names
    const u = umpire({
      fields: {
        kind: { required: true },
        fieldA: { required: true },
        fieldB: { required: true },
      },
      rules: [rule],
    })

    const withTypeA = u.check({ kind: 'typeA' })
    expect(withTypeA.fieldA.enabled).toBe(true)
    expect(withTypeA.fieldB.enabled).toBe(false)

    const withTypeB = u.check({ kind: 'typeB' })
    expect(withTypeB.fieldB.enabled).toBe(true)
    expect(withTypeB.fieldA.enabled).toBe(false)
  })

  test('overlapping fields across variants throws at oneOf validation', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('a'),
        shared: z.string(),
        onlyA: z.string(),
      }),
      z.object({
        kind: z.literal('b'),
        shared: z.string().optional(),
        onlyB: z.number(),
      }),
    ])

    expect(() =>
      deriveDiscriminatedFields(schema, { groupName: 'overlap' }),
    ).toThrow('field "shared" appears in multiple branches')
  })
})

describe('zod v4 compatibility', () => {
  test('extractBranches reads discriminator from _zod.def when .discriminator is absent', () => {
    // Simulate a v4-shaped schema: no .discriminator getter, discriminator in _zod.def,
    // and ZodLiteral exposes .value getter (not ._def.value)
    const v4LikeSchema = {
      _zod: {
        def: { discriminator: 'method' },
      },
      options: [
        {
          shape: {
            method: { _def: { values: ['card'] }, value: 'card', isOptional: () => false },
            cardNumber: { isOptional: () => false },
          },
        },
        {
          shape: {
            method: { _def: { values: ['bank'] }, value: 'bank', isOptional: () => false },
            routingNumber: { isOptional: () => false },
          },
        },
      ],
    }

    // deriveDiscriminatedFields exercises extractBranches internally
    const { fields, rule } = deriveDiscriminatedFields(v4LikeSchema as any, {
      groupName: 'v4test',
    })

    expect(fields.method).toEqual({ required: true })
    expect(fields.cardNumber).toEqual({ required: true })
    expect(fields.routingNumber).toEqual({ required: true })
    expect(Object.keys(fields).sort()).toEqual(['cardNumber', 'method', 'routingNumber'])

    // Verify the rule works end-to-end with umpire
    const u = umpire({
      fields: {
        method: { required: true },
        cardNumber: { required: true },
        routingNumber: { required: true },
      },
      rules: [rule],
    })

    const withCard = u.check({ method: 'card' })
    expect(withCard.cardNumber.enabled).toBe(true)
    expect(withCard.routingNumber.enabled).toBe(false)

    const withBank = u.check({ method: 'bank' })
    expect(withBank.routingNumber.enabled).toBe(true)
    expect(withBank.cardNumber.enabled).toBe(false)
  })

  test('extractBranches still uses .discriminator when present (v3 path)', () => {
    // Simulate a v3-shaped schema: .discriminator getter present
    const v3LikeSchema = {
      discriminator: 'type',
      options: [
        {
          shape: {
            type: { _def: { value: 'x' }, isOptional: () => false },
            xField: { isOptional: () => false },
          },
        },
        {
          shape: {
            type: { _def: { value: 'y' }, isOptional: () => false },
            yField: { isOptional: () => true },
          },
        },
      ],
    }

    const { fields } = deriveDiscriminatedFields(v3LikeSchema as any, {
      groupName: 'v3test',
    })

    expect(fields.type).toEqual({ required: true })
    expect(fields.xField).toEqual({ required: true })
    expect(fields.yField).toEqual({ required: false })
  })
})
