import { describe, it, expect } from 'bun:test'
import { enabledWhen, fairWhen, requires, umpire } from '@umpire/core'
import { umpireDynamicValidator } from '../src/dynamic.js'

describe('umpireDynamicValidator', () => {
  it('returns undefined when all fields are valid', () => {
    const engine = umpire({
      fields: { email: {}, name: { required: true } },
      rules: [
        fairWhen('email', (v) => String(v).includes('@'), {
          reason: 'Invalid email',
        }),
      ],
    })

    const validate = umpireDynamicValidator(engine)
    const result = validate({
      value: { email: 'test@test.com', name: 'John' },
      formApi: {},
    })

    expect(result).toBeUndefined()
  })

  it('disabled field produces no error', () => {
    const engine = umpire({
      fields: { country: {}, state: { required: true } },
      rules: [enabledWhen('state', (v) => (v as any).country === 'US')],
    })

    const validate = umpireDynamicValidator(engine)
    const result = validate({
      value: { country: 'Canada', state: '' },
      formApi: {},
    })

    expect(result).toBeUndefined()
  })

  it('unsatisfied required field returns error', () => {
    const engine = umpire({
      fields: { email: {}, name: { required: true } },
      rules: [],
    })

    const validate = umpireDynamicValidator(engine)
    const result = validate({
      value: { email: 'test@test.com', name: null },
      formApi: {},
    })

    expect(result).toEqual({ name: 'Required' })
  })

  it('foul field with default rejectFoul returns reason', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen('email', (v) => String(v).includes('@'), {
          reason: 'Invalid email',
        }),
      ],
    })

    const validate = umpireDynamicValidator(engine)
    const result = validate({
      value: { email: 'not-an-email' },
      formApi: {},
    })

    expect(result).toEqual({ email: 'Invalid email' })
  })

  it('foul field with rejectFoul: false produces no error', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen('email', (v) => String(v).includes('@'), {
          reason: 'Invalid email',
        }),
      ],
    })

    const validate = umpireDynamicValidator(engine, { rejectFoul: false })
    const result = validate({
      value: { email: 'not-an-email' },
      formApi: {},
    })

    expect(result).toBeUndefined()
  })

  it('field with core validation error returns error', () => {
    const engine = umpire({
      fields: { name: {} },
      rules: [],
      validators: {
        name: { validator: (v: unknown) => v !== 'bad', error: 'Bad name' },
      },
    })

    const validate = umpireDynamicValidator(engine)
    const result = validate({
      value: { name: 'bad' },
      formApi: {},
    })

    expect(result).toEqual({ name: 'Bad name' })
  })

  it('multiple errors reported in one call', () => {
    const engine = umpire({
      fields: { a: { required: true }, b: { required: true } },
      rules: [],
    })

    const validate = umpireDynamicValidator(engine)
    const result = validate({
      value: { a: null, b: null },
      formApi: {},
    })

    expect(result).toEqual({ a: 'Required', b: 'Required' })
  })

  it('conditions passed as function are called with formApi', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [
        enabledWhen(
          'b',
          (_v, conditions) => (conditions as any)?.mode === 'edit',
        ),
      ],
    })

    const formCaptured: Array<unknown> = []
    const validate = umpireDynamicValidator(engine, {
      conditions: (formApi: unknown) => {
        formCaptured.push(formApi)
        return { mode: 'edit' } as any
      },
    })

    const formApi = { mode: 'edit' }
    const result = validate({
      value: { a: 'x', b: 'test' },
      formApi,
    })

    expect(result).toBeUndefined()
    expect(formCaptured).toEqual([formApi])
  })

  it('conditions passed as plain object work directly', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [
        enabledWhen(
          'b',
          (_v, conditions) => (conditions as any)?.mode === 'edit',
        ),
      ],
    })

    const validate = umpireDynamicValidator(engine, {
      conditions: { mode: 'edit' } as any,
    })

    const result = validate({
      value: { a: 'x', b: 'test' },
      formApi: {},
    })

    expect(result).toBeUndefined()
  })

  it('empty errors map returns undefined', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [],
    })

    const validate = umpireDynamicValidator(engine)
    const result = validate({
      value: { a: 'ok', b: 'ok' },
      formApi: {},
    })

    expect(result).toBeUndefined()
  })
})
