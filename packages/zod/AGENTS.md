# @umpire/zod

- Use `activeSchema(availability, fieldSchemas, z)` with a field-schema shape, not a `z.object()` instance.
- Disabled fields are excluded from the active schema. Enabled but optional fields get `.optional()`.
- Normalize parse issues with `zodErrors(error)`, then filter them with `activeErrors(availability, errors)`.
- This package is availability-aware validation glue; keep availability logic in `@umpire/core`, not inside Zod refinements.
