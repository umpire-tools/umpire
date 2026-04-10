export function shouldWarnInDev(): boolean {
  const processLike = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return processLike.process?.env?.NODE_ENV !== 'production'
}
