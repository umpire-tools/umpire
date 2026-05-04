export type FieldPathSegment = string | number

export type NormalizedFieldErrorWithPath = {
  field: string
  message: string
  path?: readonly FieldPathSegment[]
}

export type NamespacedFieldOptions = {
  separator?: string
}

function separatorFrom(options?: NamespacedFieldOptions): string {
  return options?.separator ?? '.'
}

export function splitNamespacedField(
  field: string,
  options?: NamespacedFieldOptions,
): { namespace: string; localKey: string } | null {
  const separator = separatorFrom(options)
  const index = field.indexOf(separator)
  if (index === -1) return null

  return {
    namespace: field.slice(0, index),
    localKey: field.slice(index + separator.length),
  }
}

export function joinFieldPath(
  path: readonly FieldPathSegment[],
  options?: NamespacedFieldOptions,
): string {
  return path.map(String).join(separatorFrom(options))
}

export function nestNamespacedValues(
  values: Record<string, unknown>,
  options?: NamespacedFieldOptions,
): Record<string, unknown> {
  const separator = separatorFrom(options)
  const nested: Record<string, unknown> = {}

  for (const [field, value] of Object.entries(values)) {
    const path = field.split(separator)
    let cursor = nested

    for (const [index, segment] of path.entries()) {
      if (index === path.length - 1) {
        cursor[segment] = value
        continue
      }

      const next = cursor[segment]
      if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
        cursor = next as Record<string, unknown>
        continue
      }

      const child: Record<string, unknown> = {}
      cursor[segment] = child
      cursor = child
    }
  }

  return nested
}

export function flattenFieldErrorPath<T extends NormalizedFieldErrorWithPath>(
  error: T,
  options?: NamespacedFieldOptions,
): T {
  if (!error.path || error.path.length === 0) {
    return error
  }

  return {
    ...error,
    field: joinFieldPath(error.path, options),
  }
}

export function flattenFieldErrorPaths<T extends NormalizedFieldErrorWithPath>(
  errors: T[],
  options?: NamespacedFieldOptions,
): T[] {
  return errors.map((error) => flattenFieldErrorPath(error, options))
}
