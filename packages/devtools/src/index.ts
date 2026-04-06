import { h, render } from 'preact'
import { Panel } from './panel/Panel.js'
import { register, setFoulLogDepth, snapshot, subscribe, unregister } from './registry.js'
import { createShadowHost, removeShadowHost } from './shadow.js'
import type { MountOptions } from './types.js'

let mounted:
  | {
      host: HTMLElement
      root: ShadowRoot
    }
  | undefined

function resolveOptions(options: MountOptions = {}): Required<MountOptions> {
  return {
    defaultTab: options.defaultTab ?? 'matrix',
    foulLogDepth: options.foulLogDepth ?? 50,
    offset: options.offset ?? { x: 16, y: 16 },
    position: options.position ?? 'bottom-right',
  }
}

export function mount(options: MountOptions = {}) {
  const isProd = process.env.NODE_ENV === 'production'
  const hasEscapeHatch = process.env.UMPIRE_INTERNAL === 'true'

  if (isProd && !hasEscapeHatch) {
    console.warn(
      '[umpire/devtools] mount() is a no-op in production. Set UMPIRE_INTERNAL=true to override.',
    )
    return () => {}
  }

  const resolved = resolveOptions(options)
  setFoulLogDepth(resolved.foulLogDepth)

  if (!mounted) {
    mounted = createShadowHost()
  }

  render(h(Panel, { options: resolved }), mounted.root)

  return () => {
    unmount()
  }
}

export function unmount() {
  if (!mounted) {
    return
  }

  render(null, mounted.root)
  removeShadowHost(mounted.host)
  mounted = undefined
}

export { register, snapshot, subscribe, unregister }

export type {
  AnyReadInspection,
  AnyScorecard,
  AnySnapshot,
  AnyUmpire,
  DevtoolsFoulEvent,
  DevtoolsPosition,
  DevtoolsTab,
  MountOptions,
  RegisterOptions,
  RegistryEntry,
} from './types.js'
