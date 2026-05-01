import { Result, Schema } from 'effect'
import type { SchemaIssue } from 'effect'

export type EffectParseOptions = {
  readonly errors?: 'first' | 'all'
} & Record<string, unknown>

export type EffectDecodeResult<A> =
  | {
      readonly _tag: 'Right'
      readonly ok: true
      readonly right: A
      readonly value: A
      readonly source: unknown
    }
  | {
      readonly _tag: 'Left'
      readonly ok: false
      readonly left: unknown
      readonly error: unknown
      readonly source: unknown
    }

type Decoder = (input: unknown, options?: EffectParseOptions) => unknown

type EffectSchemaApi = {
  readonly decodeUnknownResult?: (
    schema: unknown,
    options?: EffectParseOptions,
  ) => Decoder
}

const schemaApi = Schema as EffectSchemaApi

export function decodeEffectSchema<A = unknown>(
  schema: unknown,
  input: unknown,
  options?: EffectParseOptions,
): EffectDecodeResult<A> {
  if (schemaApi.decodeUnknownResult) {
    return normalizeDecodeResult<A>(
      schemaApi.decodeUnknownResult(schema)(input, options),
    )
  }

  throw new Error(
    '@umpire/effect requires Effect Schema decodeUnknownResult from Effect v4.',
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
    const value = result.success as A
    return { _tag: 'Right', ok: true, right: value, value, source }
  }

  if (Result.isFailure(result)) {
    const error = result.failure
    return { _tag: 'Left', ok: false, left: error, error, source }
  }

  return { _tag: 'Left', ok: false, left: source, error: source, source }
}

export function formatEffectErrors(
  parseError: unknown,
): Array<{ field: string; message: string }> {
  const issue =
    isRecord(parseError) && 'issue' in parseError
      ? parseError.issue
      : parseError

  return formatV4Issue(issue)
}

function formatV4Issue(
  issue: unknown | SchemaIssue.Issue,
  path: ReadonlyArray<PropertyKey> = [],
): Array<{ field: string; message: string }> {
  if (!isRecord(issue)) {
    return [{ field: String(path[0] ?? ''), message: String(issue) }]
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

  return [
    {
      field: String(path[0] ?? ''),
      message: stripPathSuffix(String(issue)),
    },
  ]
}

function stripPathSuffix(message: string): string {
  return message.replace(/\n  at \[[\s\S]*$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
