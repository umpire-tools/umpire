import { umpire } from '../src/index.js'
import type { FieldsOf } from '../src/index.js'

const ump = umpire({
  fields: {
    plan: { default: 'free' as const },
    seats: { default: 1 },
    notes: { default: '' },
  },
  rules: [],
})

type UmpFields = FieldsOf<typeof ump>

const fields: UmpFields = {
  plan: { default: 'free' },
  seats: { default: 1 },
  notes: { default: '' },
}

const planDefault: UmpFields['plan']['default'] = fields.plan.default

// @ts-expect-error plan default must stay the inferred literal
const invalidPlan: UmpFields['plan']['default'] = 'pro'

void planDefault
void invalidPlan
