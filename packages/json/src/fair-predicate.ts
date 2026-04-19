import type { NamedCheckMetadata } from '@umpire/core'

export type JsonFairPredicate<
  Values extends Record<string, unknown>,
  C extends Record<string, unknown>,
  FieldName extends string = string,
> = ((
  value: unknown,
  values: Values,
  conditions: C,
) => boolean) & {
  _checkField?: FieldName
  _namedCheck?: NamedCheckMetadata
}
