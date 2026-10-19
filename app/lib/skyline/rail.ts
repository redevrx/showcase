// SKYLINE — the flight rail.
// One continuous spline: sky over the south edge, a dive down a street canyon,
// a low run along the cross-street, a climb up the north canyon and a landing
// on the rooftop gate. Scroll drives arc position through the beat warp.

import * as THREE from 'three'
import { buildWarp, type Beat, type Warp } from './beats'

export const LAYOUT = {
  cols: 9,
  rows: 12,
  /** block pitch — 42m grid, 26m blocks, 16m streets */
  pitch: 42,
  block: 26,
  /** cell key "ix,iz" -> max tower height, so the final climb stays clear */
  caps: { '6,2': 70 } as Record<string, number>,
}

export const PAD_CELL = { ix: 6, iz: 1 }
/** the rooftop gate — generated exactly at this spot by the city builder */
export const PAD = { x: 84, roofY: 148, z: -189, half: 10, slab: 1.2 }

export function cellX(ix: number) {
  return (ix - (LAYOUT.cols - 1) / 2) * LAYOUT.pitch
}

export function cellZ(iz: number) {
  return (iz - (LAYOUT.rows - 1) / 2) * LAYOUT.pitch
}

export function cellKey(ix: number, iz: number) {
  return `${ix},${iz}`
}

/** control points, south → north (x, y, z) */
const FLIGHT: Array<[number, number, number]> = [
  [-21, 128, 330],
  [-21, 112, 298],
  [-21, 92, 262],
  [-21, 68, 220],
  [-21, 42, 176],
  [-21, 22, 124],
  [-21, 15, 58],
  [-21, 14, 12],
  [-20, 13.8, 2],
  [-8, 13.5, 0],
  [10, 13.4, 0],
  [40, 14, 0],
  [56, 16, 0],
  [63, 20, -14],
  [63, 26, -44],
  [63, 32, -88],
  [63, 38, -128],
  [67, 64, -148],
  [74, 126, -166],
  [81, 160, -172],
  [84, 152, -175.5],
  [84, 151.4, -178.5],
]

export interface RailHit {
  /** arc fraction 0..1 */
  arc: number
  dist: number
  /** nearest corridor point, world XZ */
  cx: number
  cz: number
}

export interface Rail {
  length: number
  beats: Beat[]
  warp: Warp
  sample(arc: number, pos: THREE.Vector3, dir: THREE.Vector3): void
  /** nearest point of the corridor to a world XZ spot */
  nearest(x: number, z: number): RailHit
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function createRail(beats: Beat[]): Rail {
  const curve = new THREE.CatmullRomCurve3(
    FLIGHT.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'centripetal',
    0.5,
  )
  const length = curve.getLength()
  const warp = buildWarp(beats)

  // dense polyline for nearest-point queries (XZ only)
  const N = 400
  const pts = curve.getSpacedPoints(N)

  function sample(arc: number, pos: THREE.Vector3, dir: THREE.Vector3) {
    const u = clamp01(arc / length)
    curve.getPointAt(u, pos)
    curve.getTangentAt(u, dir)
  }

  function nearest(x: number, z: number): RailHit {
    let best = Infinity
    let bestArc = 0
    let bestX = 0
    let bestZ = 0
    for (let i = 0; i < N; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len2 = dx * dx + dz * dz || 1
      let t = ((x - a.x) * dx + (z - a.z) * dz) / len2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const px = a.x + dx * t
      const pz = a.z + dz * t
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz)
      if (d2 < best) {
        best = d2
        bestArc = (i + t) / N
        bestX = px
        bestZ = pz
      }
    }
    return { arc: bestArc, dist: Math.sqrt(best), cx: bestX, cz: bestZ }
  }

  return { length, beats, warp, sample, nearest }
}
