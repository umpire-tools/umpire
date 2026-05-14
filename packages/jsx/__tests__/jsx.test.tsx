/** @jsxRuntime automatic */
/** @jsxImportSource @umpire/jsx */

import { describe, expect, test } from 'bun:test'
import {
  Field,
  Requires,
  Disables,
  FairWhen,
  StandaloneDisables,
  OneOf,
  Umpire,
} from '@umpire/jsx'
import { expr } from '@umpire/dsl'

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

  test('reason prop appears when dep is missing', () => {
    const ump = (
      <Umpire>
        <Field name="name" />
        <Field name="age">
          <Requires dep="name" reason="We need your name first" />
        </Field>
      </Umpire>
    )
    const empty = ump.check({ name: null, age: null })
    expect(empty.age.enabled).toBe(false)
    expect(empty.age.reason).toBe('We need your name first')
    expect(empty.age.reasons).toEqual(['We need your name first'])

    const withName = ump.check({ name: 'Doug', age: null })
    expect(withName.age.enabled).toBe(true)
    expect(withName.age.reason).toBeNull()
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

  test('reason prop propagates to all disabled targets', () => {
    const ump = (
      <Umpire>
        <Field name="guestCheckout">
          <Disables
            fields={['email', 'password']}
            reason="Guest mode disables account fields"
          />
        </Field>
        <Field name="email" />
        <Field name="password" />
      </Umpire>
    )
    const result = ump.check({
      guestCheckout: true,
      email: null,
      password: null,
    })
    expect(result.email.enabled).toBe(false)
    expect(result.email.reason).toBe('Guest mode disables account fields')
    expect(result.password.enabled).toBe(false)
    expect(result.password.reason).toBe('Guest mode disables account fields')
  })
})

describe('Umpire JSX — combined rules', () => {
  test('reason prop appears on disabled fields', () => {
    const ump = (
      <Umpire>
        <Field name="guestCheckout">
          <Disables
            fields={['accountEmail']}
            reason="Guest mode disables account features"
          />
        </Field>
        <Field name="accountEmail" />
      </Umpire>
    )
    const result = ump.check({ guestCheckout: true, accountEmail: null })
    expect(result.accountEmail.enabled).toBe(false)
    expect(result.accountEmail.reason).toBe(
      'Guest mode disables account features',
    )
  })

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

  test('throws if Requires has value props but no dep', () => {
    expect(() => {
      const badField = Field({
        name: 'target',
        children: Requires({ eq: 'premium' }),
      })
      Umpire({ children: [Field({ name: 'source' }), badField] })
    }).toThrow('@umpire/jsx')
  })

  test('throws if Requires has when + value props', () => {
    expect(() => {
      const badField = Field({
        name: 'target',
        children: Requires({
          when: expr.eq('source', 'premium'),
          eq: 'premium',
        }),
      })
      Umpire({ children: [Field({ name: 'source' }), badField] })
    }).toThrow('@umpire/jsx')
  })
})

describe('Umpire JSX — value-conditional Requires', () => {
  test('eq prop enables target only when dep matches', () => {
    const ump = (
      <Umpire>
        <Field name="memberType" />
        <Field name="premiumFeatures">
          <Requires dep="memberType" eq="premium" />
        </Field>
      </Umpire>
    )
    const noMatch = ump.check({ memberType: 'free', premiumFeatures: null })
    expect(noMatch.premiumFeatures.enabled).toBe(false)
    const match = ump.check({ memberType: 'premium', premiumFeatures: null })
    expect(match.premiumFeatures.enabled).toBe(true)
  })

  test('gte + lte props AND together for a range', () => {
    const ump = (
      <Umpire>
        <Field name="age" />
        <Field name="seniorDiscount">
          <Requires dep="age" gte={60} lte={120} />
        </Field>
      </Umpire>
    )
    const tooYoung = ump.check({ age: 45, seniorDiscount: null })
    expect(tooYoung.seniorDiscount.enabled).toBe(false)
    const atLowerBound = ump.check({ age: 60, seniorDiscount: null })
    expect(atLowerBound.seniorDiscount.enabled).toBe(true)
    const inRange = ump.check({ age: 65, seniorDiscount: null })
    expect(inRange.seniorDiscount.enabled).toBe(true)
    const atUpperBound = ump.check({ age: 120, seniorDiscount: null })
    expect(atUpperBound.seniorDiscount.enabled).toBe(true)
    const tooOld = ump.check({ age: 150, seniorDiscount: null })
    expect(tooOld.seniorDiscount.enabled).toBe(false)
  })

  test('truthy prop enables target when dep is truthy', () => {
    const ump = (
      <Umpire>
        <Field name="hasConsent" />
        <Field name="marketingEmails">
          <Requires dep="hasConsent" truthy />
        </Field>
      </Umpire>
    )
    const noConsent = ump.check({ hasConsent: null, marketingEmails: null })
    expect(noConsent.marketingEmails.enabled).toBe(false)
    const falsyFalse = ump.check({ hasConsent: false, marketingEmails: null })
    expect(falsyFalse.marketingEmails.enabled).toBe(false)
    const falsyZero = ump.check({ hasConsent: 0, marketingEmails: null })
    expect(falsyZero.marketingEmails.enabled).toBe(false)
    const falsyEmptyStr = ump.check({ hasConsent: '', marketingEmails: null })
    expect(falsyEmptyStr.marketingEmails.enabled).toBe(false)
    const consented = ump.check({ hasConsent: true, marketingEmails: null })
    expect(consented.marketingEmails.enabled).toBe(true)
    const truthyString = ump.check({ hasConsent: 'yes', marketingEmails: null })
    expect(truthyString.marketingEmails.enabled).toBe(true)
  })

  test('in prop enables target when dep value is in the set', () => {
    const ump = (
      <Umpire>
        <Field name="plan" />
        <Field name="supportTier">
          <Requires dep="plan" in={['pro', 'enterprise']} />
        </Field>
      </Umpire>
    )
    const freePlan = ump.check({ plan: 'free', supportTier: null })
    expect(freePlan.supportTier.enabled).toBe(false)
    const proPlan = ump.check({ plan: 'pro', supportTier: null })
    expect(proPlan.supportTier.enabled).toBe(true)
  })

  test('disabled dep blocks target even if stale value matches condition', () => {
    const ump = (
      <Umpire>
        <Field name="hasAge" />
        <Field name="age">
          <Requires dep="hasAge" />
        </Field>
        <Field name="driversLicense">
          <Requires dep="age" gte={16} />
        </Field>
      </Umpire>
    )
    // age is disabled because hasAge is null — even with a stale value of 25
    const noAge = ump.check({ hasAge: null, age: 25, driversLicense: null })
    expect(noAge.age.enabled).toBe(false)
    // driversLicense should be disabled too, even though age=25 >= 16,
    // because age itself is disabled (two-rule semantics)
    expect(noAge.driversLicense.enabled).toBe(false)
  })

  test('when prop accepts raw Expr for multi-field conditions', () => {
    const ump = (
      <Umpire>
        <Field name="memberType" />
        <Field name="age" />
        <Field name="premiumSenior">
          <Requires
            when={expr.and(
              expr.eq('memberType', 'premium'),
              expr.gte('age', 60),
            )}
          />
        </Field>
      </Umpire>
    )
    const noMatch = ump.check({
      memberType: 'free',
      age: 65,
      premiumSenior: null,
    })
    expect(noMatch.premiumSenior.enabled).toBe(false)
    const match = ump.check({
      memberType: 'premium',
      age: 65,
      premiumSenior: null,
    })
    expect(match.premiumSenior.enabled).toBe(true)
  })

  test('when + dep together throws', () => {
    const premiumField = Field({
      name: 'premium',
      children: Requires({
        dep: 'memberType',
        when: expr.eq('memberType', 'premium'),
      }),
    })
    expect(() => {
      Umpire({ children: [Field({ name: 'memberType' }), premiumField] })
    }).toThrow('@umpire/jsx')
  })

  test('reason prop works with value-conditional requires', () => {
    const ump = (
      <Umpire>
        <Field name="memberType" />
        <Field name="premiumLounge">
          <Requires
            dep="memberType"
            eq="premium"
            reason="Premium members only"
          />
        </Field>
      </Umpire>
    )
    const result = ump.check({ memberType: 'free', premiumLounge: null })
    expect(result.premiumLounge.enabled).toBe(false)
    expect(result.premiumLounge.reason).toBe('Premium members only')
    expect(result.premiumLounge.reasons).toContain('Premium members only')
  })

  test('neq prop enables target only when dep does not match', () => {
    const ump = (
      <Umpire>
        <Field name="role" />
        <Field name="nonAdminTools">
          <Requires dep="role" neq="admin" />
        </Field>
      </Umpire>
    )
    const isAdmin = ump.check({ role: 'admin', nonAdminTools: null })
    expect(isAdmin.nonAdminTools.enabled).toBe(false)
    const isUser = ump.check({ role: 'user', nonAdminTools: null })
    expect(isUser.nonAdminTools.enabled).toBe(true)
  })

  test('gt prop enables target only when dep is greater than', () => {
    const ump = (
      <Umpire>
        <Field name="score" />
        <Field name="bonusRound">
          <Requires dep="score" gt={100} />
        </Field>
      </Umpire>
    )
    const below = ump.check({ score: 100, bonusRound: null })
    expect(below.bonusRound.enabled).toBe(false)
    const above = ump.check({ score: 101, bonusRound: null })
    expect(above.bonusRound.enabled).toBe(true)
  })

  test('lt prop enables target only when dep is less than', () => {
    const ump = (
      <Umpire>
        <Field name="attempts" />
        <Field name="retryPrompt">
          <Requires dep="attempts" lt={3} />
        </Field>
      </Umpire>
    )
    const atLimit = ump.check({ attempts: 3, retryPrompt: null })
    expect(atLimit.retryPrompt.enabled).toBe(false)
    const below = ump.check({ attempts: 2, retryPrompt: null })
    expect(below.retryPrompt.enabled).toBe(true)
  })

  test('notIn prop enables target when dep value is not in the set', () => {
    const ump = (
      <Umpire>
        <Field name="country" />
        <Field name="internationalShipping">
          <Requires dep="country" notIn={['US', 'CA']} />
        </Field>
      </Umpire>
    )
    const domestic = ump.check({ country: 'US', internationalShipping: null })
    expect(domestic.internationalShipping.enabled).toBe(false)
    const abroad = ump.check({ country: 'UK', internationalShipping: null })
    expect(abroad.internationalShipping.enabled).toBe(true)
  })

  test('falsy prop enables target when dep is falsy', () => {
    const ump = (
      <Umpire>
        <Field name="optOut" />
        <Field name="confirmationPrompt">
          <Requires dep="optOut" falsy />
        </Field>
      </Umpire>
    )
    const optedOut = ump.check({ optOut: true, confirmationPrompt: null })
    expect(optedOut.confirmationPrompt.enabled).toBe(false)
    const notOpted = ump.check({ optOut: false, confirmationPrompt: null })
    expect(notOpted.confirmationPrompt.enabled).toBe(true)
    const empty = ump.check({ optOut: null, confirmationPrompt: null })
    expect(empty.confirmationPrompt.enabled).toBe(false)
  })
})

describe('Umpire JSX — FairWhen', () => {
  test('field is foul when check returns false', () => {
    const ump = (
      <Umpire>
        <Field name="age" required>
          <FairWhen
            check={(v: unknown) => Number(v) >= 0}
            reason="Age cannot be negative"
          />
        </Field>
      </Umpire>
    )

    const valid = ump.check({ age: 25 })
    expect(valid.age.fair).toBe(true)

    const negative = ump.check({ age: -5 })
    expect(negative.age.fair).toBe(false)
    expect(negative.age.reason).toBe('Age cannot be negative')
  })

  test('fairWhen does not fire on unsatisfied fields', () => {
    const ump = (
      <Umpire>
        <Field name="age">
          <FairWhen
            check={(v: unknown) => Number(v) >= 0}
            reason="Age cannot be negative"
          />
        </Field>
      </Umpire>
    )

    // null/undefined is unsatisfied — fairWhen skips unsatisfied fields
    const empty = ump.check({ age: null })
    expect(empty.age.fair).toBe(true)
  })

  test('fairWhen without reason defaults to null reason', () => {
    const ump = (
      <Umpire>
        <Field name="age">
          <FairWhen check={(v: unknown) => Number(v) >= 0} />
        </Field>
      </Umpire>
    )
    const negative = ump.check({ age: -5 })
    expect(negative.age.fair).toBe(false)
    expect(negative.age.reason).not.toBeNull()
  })
})

describe('Umpire JSX — StandaloneDisables', () => {
  test('disables fields when source holds a value', () => {
    const ump = (
      <Umpire>
        <Field name="adminMode" />
        <Field name="userEmail" />
        <Field name="userPassword" />
        <StandaloneDisables
          source="adminMode"
          fields={['userEmail', 'userPassword']}
        />
      </Umpire>
    )

    const normal = ump.check({
      adminMode: null,
      userEmail: null,
      userPassword: null,
    })
    expect(normal.userEmail.enabled).toBe(true)
    expect(normal.userPassword.enabled).toBe(true)

    const adminOn = ump.check({
      adminMode: true,
      userEmail: null,
      userPassword: null,
    })
    expect(adminOn.userEmail.enabled).toBe(false)
    expect(adminOn.userPassword.enabled).toBe(false)
  })

  test('reason prop works', () => {
    const ump = (
      <Umpire>
        <Field name="adminMode" />
        <Field name="userEmail" />
        <StandaloneDisables
          source="adminMode"
          fields={['userEmail']}
          reason="Admin mode disables user settings"
        />
      </Umpire>
    )

    const result = ump.check({ adminMode: true, userEmail: null })
    expect(result.userEmail.enabled).toBe(false)
    expect(result.userEmail.reason).toBe('Admin mode disables user settings')
  })

  test('throws for unknown source field', () => {
    expect(() => {
      Umpire({
        children: [
          Field({ name: 'adminMode' }),
          StandaloneDisables({
            source: 'nonexistent',
            fields: ['userEmail'],
          }),
        ] as const,
      })
    }).toThrow('@umpire/jsx')
  })

  test('throws for unknown target field', () => {
    expect(() => {
      Umpire({
        children: [
          Field({ name: 'adminMode' }),
          StandaloneDisables({
            source: 'adminMode',
            fields: ['nonexistent'],
          }),
        ] as const,
      })
    }).toThrow('@umpire/jsx')
  })
})

describe('Umpire JSX — OneOf', () => {
  test('enforces mutual exclusivity across branches', () => {
    const ump = (
      <Umpire>
        <Field name="creditCard" />
        <Field name="bankTransfer" />
        <Field name="paypal" />
        <OneOf
          name="payment"
          groups={{
            card: ['creditCard'],
            bank: ['bankTransfer'],
            digital: ['paypal'],
          }}
        />
      </Umpire>
    )

    // None set — all enabled
    const none = ump.check({
      creditCard: null,
      bankTransfer: null,
      paypal: null,
    })
    expect(none.creditCard.enabled).toBe(true)
    expect(none.bankTransfer.enabled).toBe(true)
    expect(none.paypal.enabled).toBe(true)

    // One set — others disabled
    const cardSet = ump.check({
      creditCard: '4111...',
      bankTransfer: null,
      paypal: null,
    })
    expect(cardSet.creditCard.enabled).toBe(true)
    expect(cardSet.bankTransfer.enabled).toBe(false)
    expect(cardSet.paypal.enabled).toBe(false)
  })

  test('simple binary toggle with multi-field branch', () => {
    const ump = (
      <Umpire>
        <Field name="guestCheckout" />
        <Field name="email" />
        <Field name="password" />
        <OneOf
          name="checkout"
          groups={{
            guest: ['guestCheckout'],
            account: ['email', 'password'],
          }}
        />
      </Umpire>
    )

    const asGuest = ump.check({
      guestCheckout: true,
      email: null,
      password: null,
    })
    expect(asGuest.guestCheckout.enabled).toBe(true)
    expect(asGuest.email.enabled).toBe(false)
    expect(asGuest.password.enabled).toBe(false)

    const asAccount = ump.check({
      guestCheckout: null,
      email: 'test@test.com',
      password: 'secret',
    })
    expect(asAccount.guestCheckout.enabled).toBe(false)
    expect(asAccount.email.enabled).toBe(true)
    expect(asAccount.password.enabled).toBe(true)
  })

  test('throws for unknown field in branch', () => {
    expect(() => {
      Umpire({
        children: [
          Field({ name: 'creditCard' }),
          OneOf({
            name: 'payment',
            groups: { card: ['nonexistent'] },
          }),
        ] as const,
      })
    }).toThrow('@umpire/jsx')
  })

  test('throws for empty branch', () => {
    expect(() => {
      Umpire({
        children: [
          Field({ name: 'creditCard' }),
          OneOf({
            name: 'payment',
            groups: { card: [] },
          }),
        ] as const,
      })
    }).toThrow('@umpire/jsx')
  })
})

describe('Umpire JSX — Field isEmpty', () => {
  test('custom isEmpty overrides satisfaction detection', () => {
    const ump = (
      <Umpire>
        <Field name="score" isEmpty={(v: unknown) => v === 0} />
      </Umpire>
    )

    const zero = ump.check({ score: 0 })
    expect(zero.score.satisfied).toBe(false)

    const nonZero = ump.check({ score: 10 })
    expect(nonZero.score.satisfied).toBe(true)
  })
})

describe('Umpire JSX — edge cases', () => {
  test('empty Umpire returns working instance', () => {
    const ump = <Umpire />
    const result = ump.check({})
    expect(result).toEqual({})
  })
})
