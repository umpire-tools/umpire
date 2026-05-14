import { isThenable } from './guards.js'

export async function raceAbort<T>(
  promise: PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted()

  let cleanup: (() => void) | undefined
  const abort = new Promise<never>((_, reject) => {
    const onAbort = () => {
      try {
        signal.throwIfAborted()
      } catch (error) {
        reject(error)
        return
      }

      reject(signal.reason)
    }

    signal.addEventListener('abort', onAbort, { once: true })
    cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }
  })

  try {
    return await Promise.race([promise, abort])
  } finally {
    cleanup?.()
  }
}

export function resolveWithAbort<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted()
  return isThenable<T>(value)
    ? raceAbort(value, signal)
    : Promise.resolve(value)
}
