# @umpire/write

Thin write-policy helpers for service-layer checks with Umpire.

`@umpire/write` answers one narrow question: does this candidate create or
patch pass the Umpire availability policy for declared fields? It does not
perform schema validation, authorization, database constraint checks, or any
other persistence-safety work.

## Install

```bash
yarn add @umpire/core @umpire/write
```

## API

```ts
import { checkCreate, checkPatch } from '@umpire/write'
import type {
  WriteCheckResult,
  WriteIssue,
  WriteIssueKind,
} from '@umpire/write'
```

### `checkCreate(ump, data, context?)`

Builds a create candidate from Umpire defaults plus incoming data:

```ts
const result = checkCreate(ump, data, context)
```

The evaluated candidate is `{ ...ump.init(), ...data }`. Extra keys on `data`
are ignored by Umpire policy evaluation, but remain present on
`result.candidate`.

Create results never include transition fouls, so `result.fouls` is always
`[]`. `result.ok` is `true` only when there are no current-state policy issues.

### `checkPatch(ump, existing, patch, context?)`

Builds a patch candidate from the existing record plus incoming patch:

```ts
const result = checkPatch(ump, existing, patch, context)
```

The evaluated candidate is `{ ...existing, ...patch }`. Current-state issues
are checked with `existing` as the previous state, and transition fouls are
computed from `existing` to `candidate`.

Extra keys on either object are ignored by Umpire policy evaluation, but remain
present on `result.candidate`.

`result.ok` is `true` only when there are no current-state issues and no
transition fouls.

## Result Shape

```ts
type WriteCheckResult = {
  ok: boolean
  candidate: Record<string, unknown>
  availability: AvailabilityMap<F>
  issues: WriteIssue<F>[]
  fouls: Foul<F>[]
  errors: string[]
}

type WriteIssue<F extends Record<string, FieldDef>> = {
  kind: 'required' | 'disabled' | 'foul'
  field: keyof F & string
  message: string
}
```

Issues are derived only from fields declared in the Umpire instance. At most one
current-state issue is emitted per field, using this precedence:

1. `required`: enabled, required, and unsatisfied
2. `disabled`: satisfied and disabled
3. `foul`: satisfied, enabled, and `fair: false`

The `message` for each issue comes from the Umpire status `reason`/first
`reasons` entry when present, otherwise it falls back to:

1. `${field} is required`
2. `${field} is disabled`
3. `${field} is foul`

## Boundary

`ok` means the candidate passes Umpire write policy only. It does not mean the
input is schema-valid, authorized for the caller, safe to persist, or accepted
by your database.
