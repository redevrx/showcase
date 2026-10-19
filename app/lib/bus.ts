// Tiny window-event bus between the WebGL scene, the entrance overlay and the page.
// Uses DOM CustomEvents so there is no shared module state between SSR requests.

export type SpawnEvent =
  | { type: 'progress', v: number, label: string }
  | { type: 'phase', phase: 'boot' | 'assemble' | 'land' | 'live', label?: string }
  | { type: 'reveal' }
  | { type: 'skip' }
  | { type: 'station', i: number, n: number }

const EVENT_NAME = 'spawn:bus'

export function emitSpawn(detail: SpawnEvent) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }))
}

export function onSpawn(fn: (e: SpawnEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (ev: Event) => fn((ev as CustomEvent).detail as SpawnEvent)
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}
