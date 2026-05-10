---
'@umpire/effect': patch
---

Adds Effect-native adapter methods (`runEffect`, `runValidate`) for composable validation in `Effect.gen` flows, a `UmpireValidationError` tagged error for the Effect error channel, an `availabilityStream` over `SubscriptionRef` for composable availability in stream programs, and an `umpireLayer` factory for injecting umpire instances as Effect services via `Context.Service`.
