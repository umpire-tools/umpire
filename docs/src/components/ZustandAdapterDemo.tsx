import { useEffect, useRef } from 'react'

export default function ZustandAdapterDemo() {
  const rootRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!rootRef.current) return

    void import('./printer-demo.js').then(({ mount }) => {
      if (cancelled || !rootRef.current) return
      cleanupRef.current = mount(rootRef.current)
    })

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  return <div ref={rootRef} />
}
