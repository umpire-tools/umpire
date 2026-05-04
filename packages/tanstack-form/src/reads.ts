import type { ReadTable } from '@umpire/reads'

type UmpireReadListenerEvent<Input, R> = {
  read: R
  previousRead: R | undefined
  values: Input
  previousValues: Input | undefined
  formApi: unknown
  fieldApi?: unknown
}

type UmpireReadListenerHandler<Input, R> = (event: UmpireReadListenerEvent<Input, R>) => void

type UmpireReadListenerHandlers<Input, Reads extends Record<string, unknown>> = {
  [K in keyof Reads & string]?: UmpireReadListenerHandler<Input, Reads[K]>
}

export type UmpireReadListenersOptions = {
  events?: Array<'onChange' | 'onBlur'>
  debounceMs?: number
  selectInput?: (values: Record<string, unknown>, formApi: unknown) => Record<string, unknown>
}

export function umpireReadListeners<
  Input extends Record<string, unknown>,
  Reads extends Record<string, unknown>,
>(
  reads: ReadTable<Input, Reads>,
  handlers: UmpireReadListenerHandlers<Input, Reads>,
  options?: UmpireReadListenersOptions,
): Record<string, unknown> {
  let previousReads: Partial<Reads> | undefined
  let previousValues: Input | undefined

  const events = options?.events ?? ['onChange']

  function evaluate(values: Input, formApi: unknown, fieldApi?: unknown) {
    const currentReads = reads.resolve(values)

    for (const [key, handler] of Object.entries(handlers) as [
      keyof Reads & string,
      UmpireReadListenerHandler<Input, unknown> | undefined,
    ][]) {
      if (!handler) continue

      const read = (currentReads as Record<string, unknown>)[key as string]
      const previousRead = previousReads
        ? (previousReads as Record<string, unknown>)[key as string]
        : undefined

      handler({
        read,
        previousRead,
        values,
        previousValues,
        formApi,
        fieldApi,
      })
    }

    previousReads = currentReads as Partial<Reads>
    previousValues = values
  }

  const result: Record<string, unknown> = {}

  for (const event of events) {
    result[event] = ({
      formApi,
      fieldApi,
    }: {
      formApi: unknown
      fieldApi?: unknown
    }) => {
      const values = options?.selectInput
        ? (
            options.selectInput(
              (formApi as { state: { values: Record<string, unknown> } }).state
                .values,
              formApi,
          ) as Input)
        : (
            (formApi as { state: { values: Record<string, unknown> } }).state
              .values as Input
          )

      evaluate(values, formApi, fieldApi)
    }

    if (options?.debounceMs && options.debounceMs > 0) {
      result[`${event}DebounceMs`] = options.debounceMs
    }
  }

  return result
}
