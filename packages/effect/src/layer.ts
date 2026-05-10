import { Layer } from 'effect'
import { umpire } from '@umpire/core'
import type {
  FieldInput,
  NormalizeFields,
  Rule,
  Umpire,
  ValidationMap,
} from '@umpire/core'

type UmpireDefinition<
  FInput extends Record<string, FieldInput>,
  C extends Record<string, unknown>,
> = {
  fields: FInput
  rules: Rule<NormalizeFields<FInput>, C>[]
  validators?: ValidationMap<NormalizeFields<FInput>>
}

export function umpireLayer<
  FInput extends Record<string, FieldInput>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  // Effect v4 beta 59: Context.Service returns ServiceClass but Layer.sync
  // expects Key — they are compatible at runtime but the types don't align.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tag: any,
  definition: UmpireDefinition<FInput, C>,
): Layer.Layer<Umpire<NormalizeFields<FInput>, C>, never, never> {
  return Layer.sync(tag, () => umpire(definition))
}
