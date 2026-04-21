import type { AvailabilityMap, FieldDef } from '@umpire/core'
import type {
  DevtoolsExtension,
  DevtoolsExtensionInspectContext,
  DevtoolsExtensionSection,
} from '@umpire/devtools'
import { deriveErrors, zodErrors } from './derive-errors.js'
import type { NormalizedFieldError } from './derive-errors.js'
import type { ZodSafeParseResultLike } from './zod-types.js'

type ZodValidationInspection<F extends Record<string, FieldDef>> = {
  availability?: AvailabilityMap<F>
  result: ZodSafeParseResultLike
  schemaFields?: readonly (keyof F & string)[] | readonly string[]
} & (
  | { normalizedErrors?: undefined }
  | { normalizedErrors: NormalizedFieldError[] }
)

type ZodValidationResolveOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = {
  id?: string
  label?: string
  resolve(
    context: DevtoolsExtensionInspectContext<F, C>,
  ): ZodValidationInspection<F> | null
}

type ZodValidationStaticOptions<F extends Record<string, FieldDef>> = {
  availability: AvailabilityMap<F>
  id?: string
  label?: string
} & ZodValidationInspection<F>

export type ZodValidationExtensionOptions<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
> = ZodValidationResolveOptions<F, C> | ZodValidationStaticOptions<F>

function issueFieldLabel(field: string) {
  return field === '' ? '(form)' : field
}

function sectionRows<F extends Record<string, FieldDef>>(
  availability: AvailabilityMap<F>,
  issues: NormalizedFieldError[],
) {
  const suppressedIssues = issues.filter((issue) => {
    const state = availability[issue.field as keyof F & string]
    return state !== undefined && !state.enabled
  })
  const unknownIssues = issues.filter(
    (issue) => availability[issue.field as keyof F & string] === undefined,
  )

  return {
    suppressedIssues,
    unknownIssues,
  }
}

function hasResolve<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown>,
>(
  options: ZodValidationExtensionOptions<F, C>,
): options is ZodValidationResolveOptions<F, C> {
  return 'resolve' in options
}

export function zodValidationExtension<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(options: ZodValidationExtensionOptions<F, C>): DevtoolsExtension<F, C> {
  const { id = 'validation', label = 'validation' } = options

  return {
    id,
    label,
    inspect(context) {
      const resolved = hasResolve(options) ? options.resolve(context) : options

      if (!resolved) {
        return null
      }

      const availability = resolved.availability ?? context.scorecard.check
      const normalizedErrors =
        resolved.normalizedErrors ??
        (resolved.result.success ? [] : zodErrors(resolved.result.error))
      const derivedErrorMap = deriveErrors(availability, normalizedErrors)
      const enabledFieldCount = Object.values(availability).filter(
        (field) => field.enabled,
      ).length
      const derivedErrorCount = Object.keys(derivedErrorMap).length
      const { suppressedIssues, unknownIssues } = sectionRows(
        availability,
        normalizedErrors,
      )
      const sections: DevtoolsExtensionSection[] = [
        {
          kind: 'badges',
          title: 'Summary',
          badges: [
            {
              tone: resolved.result.success ? 'enabled' : 'disabled',
              value: resolved.result.success ? 'valid' : 'invalid',
            },
            {
              tone: 'accent',
              value: `errors ${derivedErrorCount}`,
            },
            {
              tone: 'muted',
              value: `suppressed ${suppressedIssues.length}`,
            },
            {
              tone: 'fair',
              value: `unmapped ${unknownIssues.length}`,
            },
            {
              tone: 'fair',
              value: `fields ${enabledFieldCount}`,
            },
          ],
        },
      ]

      if (Object.keys(derivedErrorMap).length > 0) {
        sections.push({
          kind: 'rows',
          title: 'Derived Error Map',
          rows: Object.entries(derivedErrorMap).map(([field, message]) => ({
            label: field,
            value: message,
          })),
        })
      }

      if (resolved.schemaFields && resolved.schemaFields.length > 0) {
        sections.push({
          kind: 'rows',
          title: 'Derived Schema',
          rows: [
            { label: 'field count', value: resolved.schemaFields.length },
            { label: 'fields', value: resolved.schemaFields.join(', ') },
          ],
        })
      }

      if (suppressedIssues.length > 0) {
        sections.push({
          kind: 'items',
          title: 'Suppressed Issues',
          items: suppressedIssues.map((issue, index) => {
            const state = availability[issue.field as keyof F & string]

            return {
              id: `${issue.field}:${index}`,
              title: issueFieldLabel(issue.field),
              badge: {
                tone: 'muted',
                value: 'disabled',
              },
              body: issue.message,
              rows: state?.reason
                ? [{ label: 'availability reason', value: state.reason }]
                : undefined,
            }
          }),
        })
      }

      if (unknownIssues.length > 0) {
        sections.push({
          kind: 'items',
          title: 'Unmapped Issues',
          items: unknownIssues.map((issue, index) => ({
            id: `${issue.field}:${index}`,
            title: issueFieldLabel(issue.field),
            badge: {
              tone: 'fair',
              value: 'unmapped',
            },
            body: issue.message,
          })),
        })
      }

      return {
        empty: 'No validation details available.',
        sections,
      }
    },
  }
}
