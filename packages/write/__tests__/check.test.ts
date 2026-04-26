import { expect, test } from 'bun:test'

import { enabledWhen, umpire } from '@umpire/core'

import { checkCreate, checkPatch } from '@umpire/write'

test('checkCreate returns the merged create shape', () => {
  const ump = umpire({
    fields: {
      toggle: { default: false },
      dependent: {},
    },
    rules: [enabledWhen('dependent', (values) => values.toggle === true)],
  })

  const result = checkCreate(ump, { dependent: 'new value' })

  expect(result.ok).toBe(false)
  expect(result.candidate).toMatchObject({
    toggle: false,
    dependent: 'new value',
  })
  expect(result.fouls).toEqual([])
  expect(result.issues).toEqual([
    {
      kind: 'disabled',
      field: 'dependent',
      message: 'condition not met',
    },
  ])
})

test('checkPatch returns the write result shape', () => {
  const ump = umpire({
    fields: { toggle: {}, dependent: {} },
    rules: [enabledWhen('dependent', (values) => values.toggle === true)],
  })

  const result = checkPatch(
    ump,
    { toggle: true, dependent: 'keep me' },
    { toggle: false },
  )

  expect(result).toMatchObject({
    ok: false,
    candidate: { toggle: false, dependent: 'keep me' },
    fouls: [
      {
        field: 'dependent',
        reason: 'condition not met',
      },
    ],
    errors: ['condition not met', 'condition not met'],
  })
  expect(result.availability.dependent.enabled).toBe(false)
  expect(result.issues).toEqual([
    {
      kind: 'disabled',
      field: 'dependent',
      message: 'condition not met',
    },
  ])
})
