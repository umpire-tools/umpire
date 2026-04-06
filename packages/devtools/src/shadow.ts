export const SHADOW_HOST_ID = 'umpire-devtools'

export function createShadowHost() {
  const existing = document.getElementById(SHADOW_HOST_ID)

  if (existing?.shadowRoot) {
    return {
      host: existing,
      root: existing.shadowRoot,
    }
  }

  const host = document.createElement('div')
  host.id = SHADOW_HOST_ID
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.zIndex = '2147483647'

  document.body.appendChild(host)

  return {
    host,
    root: host.attachShadow({ mode: 'open' }),
  }
}

export function removeShadowHost(host: HTMLElement) {
  host.remove()
}
