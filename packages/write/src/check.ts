import type { AvailabilityMap, FieldDef, Foul, Umpire } from '@umpire/core'

export type WriteIssueKind = 'required' | 'disabled' | 'foul'

export type WriteIssue<F extends Record<string, FieldDef>> = {
  kind: WriteIssueKind
  field: keyof F & string
  message: string
}

export type WriteCheckResult<F extends Record<string, FieldDef>> = {
  ok: boolean
  candidate: Record<string, unknown>
  availability: AvailabilityMap<F>
  issues: WriteIssue<F>[]
  fouls: Foul<F>[]
  errors: string[]
}

export function checkCreate<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  data: Record<string, unknown>,
  context?: C,
): WriteCheckResult<F> {
  const candidate = { ...ump.init(), ...data }
  const availability = ump.check(candidate, context)
  const issues = issuesFromAvailability(availability)

  return {
    ok: issues.length === 0,
    candidate,
    availability,
    issues,
    fouls: [],
    errors: issues.map((issue) => issue.message),
  }
}

export function checkPatch<
  F extends Record<string, FieldDef>,
  C extends Record<string, unknown> = Record<string, unknown>,
>(
  ump: Umpire<F, C>,
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
  context?: C,
): WriteCheckResult<F> {
  const candidate = { ...existing, ...patch }
  const availability = ump.check(candidate, context, existing)
  const issues = issuesFromAvailability(availability)
  const fouls = ump.play(
    { values: existing, conditions: context },
    { values: candidate, conditions: context },
  )

  return {
    ok: issues.length === 0 && fouls.length === 0,
    candidate,
    availability,
    issues,
    fouls,
    errors: [
      ...issues.map((issue) => issue.message),
      ...fouls.map((foul) => foul.reason),
    ],
  }
}

function issuesFromAvailability<F extends Record<string, FieldDef>>(
  availability: AvailabilityMap<F>,
): WriteIssue<F>[] {
  const issues: WriteIssue<F>[] = []

  for (const field of Object.keys(availability) as Array<keyof F & string>) {
    const status = availability[field]
    const reason = status.reason ?? status.reasons[0]

    if (status.enabled && status.required && !status.satisfied) {
      issues.push({
        kind: 'required',
        field,
        message: reason ?? `${field} is required`,
      })
      continue
    }

    if (status.satisfied && !status.enabled) {
      issues.push({
        kind: 'disabled',
        field,
        message: reason ?? `${field} is disabled`,
      })
      continue
    }

    if (status.satisfied && status.enabled && !status.fair) {
      issues.push({
        kind: 'foul',
        field,
        message: reason ?? `${field} is foul`,
      })
    }
  }

  return issues
}
