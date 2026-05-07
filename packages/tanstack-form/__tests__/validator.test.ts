import { enabledWhen, fairWhen, requires, umpire } from '@umpire/core'
import { describe, it, expect } from 'bun:test'
import {
  umpireFieldValidator,
  umpireFieldValidators,
} from '../src/validator.js'

describe('umpireFieldValidator', () => {
  type Values = Record<string, unknown>
  type Conditions = { mode: 'edit' }
  type FieldValidatorCall = (opts: {
    value: unknown
    fieldApi: {
      form: { state: { values: Record<string, unknown> } }
    }
  }) => unknown

  function validator(value: unknown): FieldValidatorCall {
    return value as FieldValidatorCall
  }

  it('disabled field produces no error', () => {
    const engine = umpire({
      fields: { country: {}, state: {} },
      rules: [enabledWhen('state', (v) => (v as Values).country === 'US')],
    })

    const validators = umpireFieldValidator(engine, 'state')
    const result = validator(validators.onChange)({
      value: 'CA',
      fieldApi: {
        form: { state: { values: { country: 'Canada', state: 'ON' } } },
      },
    })

    expect(result).toBeUndefined()
  })

  it('foul field with default rejectFoul returns the foul reason', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [
        fairWhen('email', (v) => String(v).includes('@'), {
          reason: 'Invalid email',
        }),
      ],
    })

    const validators = umpireFieldValidator(engine, 'email')
    const result = validator(validators.onChange)({
      value: 'not-an-email',
      fieldApi: { form: { state: { values: { email: 'not-an-email' } } } },
    })

    expect(result).toBe('Invalid email')
  })

  it('foul field without a reason returns the invalid value fallback', () => {
    const engine = {
      check: () => ({
        email: { enabled: true, fair: false, reason: null },
      }),
      graph: () => ({ nodes: ['email'], edges: [] }),
    }

    const validators = umpireFieldValidator(engine as never, 'email')
    const result = validator(validators.onChange)({
      value: 'not-an-email',
      fieldApi: { form: { state: { values: { email: 'not-an-email' } } } },
    })

    expect(result).toBe('Invalid value')
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

    const validators = umpireFieldValidator(engine, 'email', {
      rejectFoul: false,
    })
    const result = validator(validators.onChange)({
      value: 'not-an-email',
      fieldApi: { form: { state: { values: { email: 'not-an-email' } } } },
    })

    expect(result).toBeUndefined()
  })

  it('field with core validation error metadata returns it', () => {
    const engine = umpire({
      fields: { name: {} },
      rules: [],
      validators: {
        name: { validator: (v: unknown) => v !== 'bad', error: 'Bad name' },
      },
    })

    const validators = umpireFieldValidator(engine, 'name')
    const result = validator(validators.onChange)({
      value: 'bad',
      fieldApi: { form: { state: { values: { name: 'bad' } } } },
    })

    expect(result).toBe('Bad name')
  })

  it('field that is fair and enabled returns undefined', () => {
    const engine = umpire({
      fields: { name: {} },
      rules: [],
    })

    const validators = umpireFieldValidator(engine, 'name')
    const result = validator(validators.onChange)({
      value: 'hello',
      fieldApi: { form: { state: { values: { name: 'hello' } } } },
    })

    expect(result).toBeUndefined()
  })

  it('default events are onChange', () => {
    const engine = umpire({ fields: { a: {} }, rules: [] })

    const validators = umpireFieldValidator(engine, 'a')

    expect(validators.onChange).toBeDefined()
    expect(validators.onChangeListenTo).toBeDefined()
    expect(validators.onBlur).toBeUndefined()
    expect(validators.onBlurListenTo).toBeUndefined()
  })

  it('custom events onChange and onBlur produce both event keys', () => {
    const engine = umpire({ fields: { a: {} }, rules: [] })

    const validators = umpireFieldValidator(engine, 'a', {
      events: ['onChange', 'onBlur'],
    })

    expect(validators.onChange).toBeDefined()
    expect(validators.onChangeListenTo).toBeDefined()
    expect(validators.onBlur).toBeDefined()
    expect(validators.onBlurListenTo).toBeDefined()
  })

  it('onSubmit event produces onSubmit and onSubmitListenTo keys', () => {
    const engine = umpire({ fields: { a: {} }, rules: [] })

    const validators = umpireFieldValidator(engine, 'a', {
      events: ['onSubmit'],
    })

    expect(validators.onSubmit).toBeDefined()
    expect(validators.onSubmitListenTo).toBeDefined()
    expect(validators.onChange).toBeUndefined()
    expect(validators.onBlur).toBeUndefined()
  })

  it('onSubmit validator is called and returns correct value', () => {
    const engine = umpire({
      fields: { email: {} },
      rules: [],
    })

    const validators = umpireFieldValidator(engine, 'email', {
      events: ['onSubmit'],
    })

    const result = validator(validators.onSubmit)({
      value: 'test@example.com',
      fieldApi: {
        form: { state: { values: { email: 'test@example.com' } } },
      },
    })

    expect(result).toBeUndefined()
  })

  it('explicit listenTo override replaces graph-derived listeners', () => {
    const engine = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [requires('c', 'a')],
    })

    const validators = umpireFieldValidator(engine, 'c', {
      listenTo: ['x', 'y'],
    })

    expect(validators.onChangeListenTo).toEqual(['x', 'y'])
  })

  it('output includes onChangeListenTo matching dependency graph', () => {
    const engine = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [requires('c', 'a'), requires('c', 'b')],
    })

    const validators = umpireFieldValidator(engine, 'c')

    expect(validators.onChangeListenTo).toEqual(['a', 'b'])
  })

  it('conditions passed as function are called with fieldApi.form', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [
        enabledWhen('b', (_v, conditions) => conditions?.mode === 'edit'),
      ],
    } satisfies Parameters<typeof umpire<{ a: {}; b: {} }, Conditions>>[0])

    const formCaptured: Array<unknown> = []
    const validators = umpireFieldValidator(engine, 'b', {
      conditions: (formApi: unknown) => {
        formCaptured.push(formApi)
        return { mode: 'edit' }
      },
    })

    const form = { state: { values: { a: 'x', b: 'test' } } }
    const result = validator(validators.onChange)({
      value: 'test',
      fieldApi: { form },
    })

    expect(result).toBeUndefined()
    expect(formCaptured).toEqual([form])
  })

  it('conditions passed as plain object work directly', () => {
    const engine = umpire({
      fields: { a: {}, b: {} },
      rules: [
        enabledWhen('b', (_v, conditions) => conditions?.mode === 'edit'),
      ],
    } satisfies Parameters<typeof umpire<{ a: {}; b: {} }, Conditions>>[0])

    const validators = umpireFieldValidator(engine, 'b', {
      conditions: { mode: 'edit' },
    })
    const result = validator(validators.onChange)({
      value: 'test',
      fieldApi: { form: { state: { values: { a: 'x', b: 'test' } } } },
    })

    expect(result).toBeUndefined()
  })
})

describe('umpireFieldValidators', () => {
  it('returns a map for all fields from engine.graph().nodes', () => {
    const engine = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [requires('b', 'a')],
    })

    const result = umpireFieldValidators(engine)

    expect(Object.keys(result)).toEqual(['a', 'b', 'c'])
  })

  it('each entry is a valid validators object', () => {
    const engine = umpire({
      fields: { x: {}, y: {} },
      rules: [],
    })

    const result = umpireFieldValidators(engine)

    for (const fieldName of ['x', 'y']) {
      expect(result[fieldName].onChange).toBeDefined()
      expect(result[fieldName].onChangeListenTo).toBeDefined()
    }
  })

  it('fields with inbound dependencies get correct onChangeListenTo', () => {
    const engine = umpire({
      fields: { a: {}, b: {}, c: {} },
      rules: [requires('b', 'a')],
    })

    const result = umpireFieldValidators(engine)

    expect(result.a.onChangeListenTo).toEqual([])
    expect(result.b.onChangeListenTo).toEqual(['a'])
    expect(result.c.onChangeListenTo).toEqual([])
  })
})
