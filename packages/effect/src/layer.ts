import { Context, Layer } from 'effect'
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
  I = Umpire<NormalizeFields<FInput>, C>,
>(
  tag: Context.Key<I, Umpire<NormalizeFields<FInput>, C>>,
  definition: UmpireDefinition<FInput, C>,
): Layer.Layer<I, never, never> {
  return Layer.sync(tag, () => umpire(definition))
}
