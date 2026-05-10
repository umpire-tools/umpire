/** @jsxRuntime automatic */
/** @jsxImportSource @umpire/jsx */

import { describe, expect, test } from 'bun:test'
import { Field, Requires, Disables, Umpire } from '@umpire/jsx'

describe('Umpire JSX — basic field definition', () => {
  test('single field, no rules', () => {
    const ump = (
      <Umpire>
        <Field name="name" />
      </Umpire>
    )

    const result = ump.check({ name: null })
    expect(result.name.enabled).toBe(true)
    expect(result.name.satisfied).toBe(false)
  })

  test('required field', () => {
    const ump = (
      <Umpire>
        <Field name="name" required />
      </Umpire>
    )

    const result = ump.check({ name: null })
    expect(result.name.required).toBe(true)
    expect(result.name.satisfied).toBe(false)
  })

  test('multiple fields', () => {
    const ump = (
      <Umpire>
        <Field name="firstName" />
        <Field name="lastName" />
        <Field name="email" required />
      </Umpire>
    )

    const result = ump.check({ firstName: 'Doug', lastName: null, email: null })
    expect(result.firstName.satisfied).toBe(true)
    expect(result.lastName.satisfied).toBe(false)
    expect(result.email.required).toBe(true)
  })
})

describe('Umpire JSX — Requires', () => {
  test('field is disabled until dep is filled', () => {
    const ump = (
      <Umpire>
        <Field name="name" />
        <Field name="age">
          <Requires dep="name" />
        </Field>
      </Umpire>
    )

    const empty = ump.check({ name: null, age: null })
    expect(empty.age.enabled).toBe(false)

    const withName = ump.check({ name: 'Doug', age: null })
    expect(withName.age.enabled).toBe(true)
  })

  test('field with multiple Requires', () => {
    const ump = (
      <Umpire>
        <Field name="firstName" />
        <Field name="lastName" />
        <Field name="bio">
          <Requires dep="firstName" />
          <Requires dep="lastName" />
        </Field>
      </Umpire>
    )

    const noneSet = ump.check({ firstName: null, lastName: null, bio: null })
    expect(noneSet.bio.enabled).toBe(false)

    const halfSet = ump.check({ firstName: 'Doug', lastName: null, bio: null })
    expect(halfSet.bio.enabled).toBe(false)

    const bothSet = ump.check({
      firstName: 'Doug',
      lastName: 'Brown',
      bio: null,
    })
    expect(bothSet.bio.enabled).toBe(true)
  })
})

describe('Umpire JSX — Disables', () => {
  test('field disables others when it holds a value', () => {
    const ump = (
      <Umpire>
        <Field name="guestCheckout">
          <Disables fields={['accountEmail', 'accountPassword']} />
        </Field>
        <Field name="accountEmail" />
        <Field name="accountPassword" />
      </Umpire>
    )

    const withoutGuest = ump.check({
      guestCheckout: null,
      accountEmail: null,
      accountPassword: null,
    })
    expect(withoutGuest.accountEmail.enabled).toBe(true)
    expect(withoutGuest.accountPassword.enabled).toBe(true)

    const asGuest = ump.check({
      guestCheckout: true,
      accountEmail: null,
      accountPassword: null,
    })
    expect(asGuest.accountEmail.enabled).toBe(false)
    expect(asGuest.accountPassword.enabled).toBe(false)
  })
})

describe('Umpire JSX — combined rules', () => {
  test('chain of requires with disables', () => {
    const ump = (
      <Umpire>
        <Field name="hasPromo" />
        <Field name="promoCode">
          <Requires dep="hasPromo" />
        </Field>
        <Field name="discount">
          <Requires dep="promoCode" />
        </Field>
        <Field name="standardPrice">
          <Disables fields={['discount']} />
        </Field>
      </Umpire>
    )

    const initial = ump.check({
      hasPromo: null,
      promoCode: null,
      discount: null,
      standardPrice: null,
    })
    expect(initial.promoCode.enabled).toBe(false)
    expect(initial.discount.enabled).toBe(false)

    const withPromo = ump.check({
      hasPromo: true,
      promoCode: 'SAVE10',
      discount: null,
      standardPrice: null,
    })
    expect(withPromo.promoCode.enabled).toBe(true)
    expect(withPromo.discount.enabled).toBe(true)

    const withStandardPrice = ump.check({
      hasPromo: true,
      promoCode: 'SAVE10',
      discount: null,
      standardPrice: 99,
    })
    expect(withStandardPrice.discount.enabled).toBe(false)
  })
})

describe('Umpire JSX — error cases', () => {
  test('throws if non-Field child passed to Umpire', () => {
    expect(() => {
      const badChild = { _ump: 'requires', dep: 'x' }
      // @ts-expect-error — intentionally wrong child type
      Umpire({ children: badChild })
    }).toThrow('@umpire/jsx')
  })
})
