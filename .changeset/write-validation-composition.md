---
"@umpire/write": minor
---

Add generic validation composition helpers and types: `composeWriteResult`, `runWriteValidationAdapter`, `WriteValidationAdapter`, `WriteRuleIssue`, `WriteSchemaIssue`, `WriteValidationRun`, `WriteDebug`, `ComposeWriteResultInput`, `WriteComposedResult`. These handle combining write check results with structural validation adapters and extra issue groups — Drizzle, Prisma, or any future ORM adapter can compose on top.
