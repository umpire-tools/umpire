import type { Accessor } from 'solid-js'
import type { FieldDef, InputValues, Umpire } from '@umpire/core'
import {
  reactiveUmp,
  type ReactiveUmpOptions,
  type ReactiveUmpire,
} from '@umpire/signals'
import { solidAdapter } from '@umpire/signals/solid'

export type FromSolidStoreOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
> = {
  values: InputValues
  set(name: keyof F & string, value: unknown): void
  conditions?: Partial<{ [K in keyof C & string]: Accessor<C[K]> }>
}

export type SolidStoreUmpire<F extends Record<string, FieldDef>> = ReactiveUmpire<F>

export function fromSolidStore<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  options: FromSolidStoreOptions<F, C>,
): SolidStoreUmpire<F> {
  const fieldNames = ump.graph().nodes as Array<keyof F & string>

  const signals = Object.fromEntries(
    fieldNames.map((name) => [
      name,
      {
        get: () => options.values[name],
        set: (value: unknown) => options.set(name, value),
      },
    ]),
  ) as NonNullable<ReactiveUmpOptions<F>['signals']>

  let conditions: NonNullable<ReactiveUmpOptions<F>['conditions']> | undefined
  if (options.conditions) {
    conditions = {}
    for (const [name, accessor] of Object.entries(options.conditions)) {
      if (!accessor) {
        continue
      }
      conditions[name] = { get: accessor as Accessor<unknown> }
    }
  }

  return reactiveUmp(ump, solidAdapter, {
    signals,
    conditions,
  })
}
