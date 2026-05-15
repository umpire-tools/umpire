import { Effect, Result, Schema } from 'effect'
import type { SchemaAST, SchemaIssue } from 'effect'
import type { FieldPathSegment } from '@umpire/write'

export type EffectParseOptions = SchemaAST.ParseOptions

export type NormalizedEffectError = {
  field: string
  message: string
  path?: readonly FieldPathSegment[]
}

export type EffectDecodeResult<A> =
  | {
      readonly _tag: 'Right'
      readonly value: A
    }
  | {
      readonly _tag: 'Left'
      readonly error: unknown
    }

export function decodeEffectSchema<A = unknown, R = never>(
  schema: Schema.Decoder<A, R>,
  input: unknown,
  options?: EffectParseOptions,
): Effect.Effect<EffectDecodeResult<A>, never, R> {
  return Schema.decodeUnknownEffect(schema)(input, options).pipe(
    Effect.match({
      onSuccess: (value): EffectDecodeResult<A> => ({ _tag: 'Right', value }),
      onFailure: (error): EffectDecodeResult<A> => {
        const issue =
          isRecord(error) && error._tag === 'SchemaError' && 'issue' in error
            ? (error as { issue: unknown }).issue
            : error
        return { _tag: 'Left', error: issue }
      },
    }),
  )
}

export function decodeEffectSchemaSync<A = unknown>(
  schema: Schema.Decoder<unknown, never>,
  input: unknown,
  options?: EffectParseOptions,
): EffectDecodeResult<A> {
  return normalizeDecodeResult<A>(
    Schema.decodeUnknownResult(schema)(input, options),
  )
}

export function isDecodeFailure<A>(
  result: EffectDecodeResult<A>,
): result is Extract<EffectDecodeResult<A>, { readonly _tag: 'Left' }> {
  return result._tag === 'Left'
}

export function isDecodeSuccess<A>(
  result: EffectDecodeResult<A>,
): result is Extract<EffectDecodeResult<A>, { readonly _tag: 'Right' }> {
  return result._tag === 'Right'
}

function normalizeDecodeResult<A>(source: unknown): EffectDecodeResult<A> {
  const result = source as Result.Result<A, unknown>

  if (Result.isSuccess(result)) {
    return { _tag: 'Right', value: result.success as A }
  }

  if (Result.isFailure(result)) {
    return { _tag: 'Left', error: result.failure }
  }

  throw new Error(
    '@umpire/effect expected Schema.decodeUnknownResult() to return an Effect Result.',
  )
}

export function formatEffectErrors(
  parseError: unknown,
): NormalizedEffectError[] {
  const issue =
    isRecord(parseError) &&
    'issue' in parseError &&
    (!('_tag' in parseError) || parseError._tag === 'SchemaError')
      ? parseError.issue
      : parseError

  return formatV4Issue(issue)
}

function formatV4Issue(
  issue: unknown | SchemaIssue.Issue,
  path: ReadonlyArray<PropertyKey> = [],
): NormalizedEffectError[] {
  if (!isRecord(issue)) {
    const result: NormalizedEffectError = {
      field: String(path[0] ?? ''),
      message: String(issue),
    }
    if (path.length > 1) result.path = toFieldPath(path)
    return [result]
  }

  if (issue._tag === 'Pointer') {
    const pointerPath = Array.isArray(issue.path) ? issue.path : []
    return formatV4Issue(issue.issue, [...path, ...pointerPath])
  }

  if (issue._tag === 'Composite' && Array.isArray(issue.issues)) {
    return issue.issues.flatMap((child) => formatV4Issue(child, path))
  }

  if (issue._tag === 'Filter' && 'issue' in issue) {
    return formatV4Issue(issue.issue, path)
  }

  const result: NormalizedEffectError = {
    field: String(path[0] ?? ''),
    message: stripPathSuffix(String(issue)),
  }
  if (path.length > 1) result.path = toFieldPath(path)
  return [result]
}

function toFieldPath(path: ReadonlyArray<PropertyKey>): FieldPathSegment[] {
  return path.map((segment) =>
    typeof segment === 'number' ? segment : String(segment),
  )
}

function stripPathSuffix(message: string): string {
  return message.replace(/\n  at \[[\s\S]*$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
