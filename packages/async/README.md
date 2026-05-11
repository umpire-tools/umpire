# @umpire/async

Async-aware field-availability engine — superset of [@umpire/core](https://www.npmjs.com/package/@umpire/core) with async rules, async validators, and built-in cancellation.

[Docs](https://umpire.tools/) · [Quick Start](https://umpire.tools/learn/)

## Install

```bash
npm install @umpire/async
```

## Usage

```ts
import { umpire, enabledWhen, requires } from '@umpire/async'

const ump = umpire({
  fields: {
    planType: {},
    teamSize: {},
  },
  rules: [
    requires('teamSize', 'planType'),
    enabledWhen('teamSize', async (values, conditions) => {
      const plan = await fetchPlanDetails(conditions.accountId)
      return plan.allowsTeams
    }),
  ],
})

const availability = await ump.check(values, conditions)
```

## API

`@umpire/async` exports async-aware versions of all core rule builders. Predicates accept `boolean | Promise<boolean>`. Async validators accept `Promise<ValidationOutcome>`. See the [core API docs](https://umpire.tools/) for full rule builder reference.
