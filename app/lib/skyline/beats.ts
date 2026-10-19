// SKYLINE — the itinerary of the flight.
// Plain math and data, no three.js: the HUD and the camera rail both read the
// same beat list, and the warp function maps raw scroll (0..1) onto the flight
// so the camera eases (soft beats) around each story moment without snapping.

export type BeatId = 'entry' | 'name' | 'portrait' | 'stats' | 'links' | 'music' | 'connect' | 'gate'

export interface Beat {
  id: BeatId
  /** HUD label, Thai */
  label: string
  /** HUD label, latin */
  en: string
  /** anchor along the flight (arc fraction 0..1) */
  t: number
  /** how strongly the camera lingers here (0..1) */
  dwell: number
}

const BASE: Beat[] = [
  { id: 'entry', label: 'ออกตัว', en: 'ENTRY', t: 0.02, dwell: 0.4 },
  { id: 'name', label: 'ชื่อ', en: 'NAME', t: 0.13, dwell: 0.75 },
  { id: 'portrait', label: 'ตัวตน', en: 'PORTRAIT', t: 0.205, dwell: 0.9 },
  { id: 'stats', label: 'สถิติ', en: 'STATS', t: 0.415, dwell: 0.7 },
  { id: 'links', label: 'ลิงก์', en: 'LINKS', t: 0.56, dwell: 0.9 },
  { id: 'music', label: 'เพลง', en: 'MUSIC', t: 0.70, dwell: 0.7 },
  { id: 'connect', label: 'ช่องทาง', en: 'CONNECT', t: 0.80, dwell: 0.65 },
  { id: 'gate', label: 'ประตูเมือง', en: 'GATE', t: 0.965, dwell: 0.95 },
]

export interface BeatAvail {
  stats?: boolean
  links?: boolean
  music?: boolean
  socials?: boolean
}

export function buildBeats(avail: BeatAvail): Beat[] {
  return BASE.filter((b) => {
    if (b.id === 'stats') return avail.stats
    if (b.id === 'links') return avail.links
    if (b.id === 'music') return avail.music
    if (b.id === 'connect') return avail.socials
    return true
  })
}

export interface Warp {
  /** scroll progress 0..1 -> arc fraction 0..1 */
  warp(p: number): number
  /** inverse — arc fraction -> scroll progress (for HUD taps) */
  invert(arc: number): number
  /** local speed factor (1 = glide, lower = lingering) */
  rate(p: number): number
}

const N = 1024
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function buildWarp(beats: Beat[]): Warp {
  const rateAt = (p: number) => {
    let s = 0
    for (const b of beats) {
      const w = 0.028 + 0.03 * b.dwell
      const d = (p - b.t) / w
      s += b.dwell * Math.exp(-d * d)
    }
    return Math.max(0.22, 1 - 0.78 * s)
  }

  const acc = new Float32Array(N + 1)
  for (let i = 0; i < N; i++) acc[i + 1] = acc[i] + rateAt(i / N)
  const total = acc[N] || 1

  return {
    rate: rateAt,
    warp(p: number) {
      const x = clamp01(p) * N
      const i = Math.floor(x)
      const f = x - i
      const a = acc[i]
      const b = acc[Math.min(N, i + 1)]
      return (a + (b - a) * f) / total
    },
    invert(arc: number) {
      const target = clamp01(arc) * total
      let lo = 0
      let hi = N
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (acc[mid] < target) lo = mid
        else hi = mid
      }
      const span = acc[hi] - acc[lo] || 1
      return (lo + (target - acc[lo]) / span) / N
    },
  }
}
