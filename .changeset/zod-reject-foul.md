---
"@umpire/zod": minor
---

- `activeSchema` now accepts an optional third argument `{ rejectFoul?: boolean }`.
- When `rejectFoul: true`, enabled fields whose value is foul (`fair: false`) are included in the schema with a refinement that always fails, using the field's `reason` as the error message.
- `createZodValidation` accepts the same `rejectFoul` option and threads it through every `run()` call.
- Use this option on the server to reject contextually invalid submissions (e.g. a gas vehicle in an electric-only parking spot) rather than silently accepting or stripping them.
- Default is `false`; existing client-side usage is unaffected.
