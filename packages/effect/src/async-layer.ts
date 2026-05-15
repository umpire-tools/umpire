import { Context, Layer } from 'effect'
import { umpire as asyncUmpire } from '@umpire/async'
import type {
  AnyRule,
  AnyValidationMap,
  Umpire as AsyncUmpire,
} from '@umpire/async'
import type { FieldInput, NormalizeFields } from '@umpire/core'

type AsyncUmpireDefinition<
  FInput extends Record<string, FieldInput>,
  C extends Record<string, unknown>,
> = {
  fields: FInput
  rules: AnyRule<NormalizeFields<FInput>, C>[]
  validators?: AnyValidationMap<NormalizeFields<FInput>>
  onAbort?: (reason?: unknown) => void
}

export function umpireAsyncLayer<
  FInput extends Record<string, FieldInput>,
  C extends Record<string, unknown> = Record<string, unknown>,
  I = AsyncUmpire<NormalizeFields<FInput>, C>,
>(
  tag: Context.Key<I, AsyncUmpire<NormalizeFields<FInput>, C>>,
  definition: AsyncUmpireDefinition<FInput, C>,
): Layer.Layer<I, never, never> {
  return Layer.sync(tag, () => asyncUmpire(definition))
}
