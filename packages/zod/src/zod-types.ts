export type ZodIssueLike = {
  path: readonly (string | number)[]
  message: string
}

export type ZodErrorLike = {
  issues: readonly ZodIssueLike[]
}

export type ZodSafeParseResultLike =
  | { success: true }
  | { success: false; error: ZodErrorLike }

export type ZodSchemaLike = {
  safeParse(value: unknown): ZodSafeParseResultLike
}
