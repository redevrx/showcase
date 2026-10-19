// PRISM — the journey controller.
// The profile is a street: scroll walks the camera from station to station
// (identity → info → links → music → outro) and the camera flies the corridor
// between them. Stations are data-driven — a profile without badges, links or
// a now-playing track simply walks a shorter street, so every profile gets
// its own itinerary with zero configuration.

import type { Profile } from '~/types/profile'

export interface Station {
  id: 'profile' | 'info' | 'links' | 'stage' | 'outro'
  label: string
  /** camera position at this station (world) */
  cam: [number, number, number]
  /** the point the camera looks at while parked here (world) */
  look: [number, number, number]
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function buildStations(profile: Profile): Station[] {
  const stations: Station[] = [
    // the gate — name cloud, handle card, avatar, the mascot
    { id: 'profile', label: 'PROFILE', cam: [0, 1.56, 8.74], look: [0, 1.25, 0] },
  ]

  const stats = profile.stats ?? {}
  const hasInfo = (profile.badges?.length ?? 0) > 0
    || stats.views != null
    || stats.likes != null
    || Boolean(stats.since)
  if (hasInfo) {
    stations.push({ id: 'info', label: 'INFO', cam: [0, 2.35, -8.2], look: [0, 2.15, -17.6] })
  }

  if ((profile.links?.length ?? 0) > 0) {
    stations.push({ id: 'links', label: 'LINKS', cam: [0, 2.35, -23.0], look: [0, 2.05, -32.0] })
  }

  if (profile.nowPlaying?.title) {
    stations.push({ id: 'stage', label: 'MUSIC', cam: [0, 2.45, -37.8], look: [0, 2.3, -46.6] })
  }

  stations.push({ id: 'outro', label: 'OUTRO', cam: [0, 2.25, -58.6], look: [0, 2.05, -66.6] })

  return stations
}

export interface JourneyHandle {
  attach(): void
  detach(): void
  update(dt: number): void
  /** damped float station index, 0..count-1 */
  f(): number
  /** nearest integer station */
  active(): number
  count(): number
  /** smooth-scroll the page to a station's anchor */
  snapTo(i: number, instant?: boolean): void
  /** fires when the nearest station changes */
  onChange(fn: (i: number, n: number) => void): () => void
}

export function createJourney(opts: { count: number; reduced?: boolean }): JourneyHandle {
  const count = Math.max(1, opts.count)
  const reduced = Boolean(opts.reduced)

  let attached = false
  let lastInputAt = -1e9
  let snap: { from: number, to: number, t: number } | null = null
  let fDamped = 0
  let fTarget = 0
  let lastActive = -1
  const listeners = new Set<(i: number, n: number) => void>()

  const scrollMax = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight)

  function currentF(): number {
    return clamp(window.scrollY / scrollMax(), 0, 1) * (count - 1)
  }

  function onScroll() {
    // events while our own snap tween is running are ignored — real user
    // intent (wheel/touch/key) cancels the tween first and re-enables this
    if (snap) return
    fTarget = currentF()
    lastInputAt = performance.now()
  }

  function onIntent() {
    lastInputAt = performance.now()
    snap = null
  }

  function attach() {
    if (attached) return
    attached = true
    fTarget = currentF()
    fDamped = fTarget
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', onIntent, { passive: true })
    window.addEventListener('touchstart', onIntent, { passive: true })
    window.addEventListener('keydown', onIntent)
  }

  function detach() {
    if (!attached) return
    attached = false
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('wheel', onIntent)
    window.removeEventListener('touchstart', onIntent)
    window.removeEventListener('keydown', onIntent)
  }

  function anchorTop(i: number): number {
    return (clamp(i, 0, count - 1) / Math.max(1, count - 1)) * scrollMax()
  }

  function snapTo(i: number, instant = false) {
    const to = anchorTop(i)
    if (reduced || instant) {
      window.scrollTo(0, to)
      fTarget = currentF()
      return
    }
    snap = { from: window.scrollY, to, t: 0 }
    lastInputAt = performance.now()
  }

  function update(dt: number) {
    if (count <= 1) {
      fDamped = 0
      return
    }

    if (snap) {
      snap.t += dt / 0.55
      const t = clamp(snap.t, 0, 1)
      window.scrollTo(0, snap.from + (snap.to - snap.from) * easeInOut(t))
      fTarget = currentF()
      if (t >= 1) snap = null
    } else {
      fTarget = currentF()
      // once the human lets go (and the camera has nearly caught up), the
      // nearest station reels the page in
      const idle = performance.now() - lastInputAt
      const near = Math.round(fTarget)
      if (idle > 160 && Math.abs(fTarget - near) > 0.002 && Math.abs(fTarget - fDamped) < 0.4) {
        snapTo(near)
      }
    }

    fDamped += (fTarget - fDamped) * (1 - Math.exp(-dt * 7))

    const active = Math.round(fDamped)
    if (active !== lastActive) {
      lastActive = active
      listeners.forEach(fn => fn(active, count))
    }
  }

  return {
    attach,
    detach,
    update,
    f: () => fDamped,
    active: () => Math.round(fDamped),
    count: () => count,
    snapTo,
    onChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
