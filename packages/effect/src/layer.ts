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
>(
  tag: ReturnType<typeof Context.Service<Umpire<NormalizeFields<FInput>, C>>>,
  definition: UmpireDefinition<FInput, C>,
): Layer.Layer<Umpire<NormalizeFields<FInput>, C>, never, never> {
  return Layer.sync(tag, () => umpire(definition))
}
