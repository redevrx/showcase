// SKYLINE — street furniture.
// The procedural city carries the shape; these small CC0/CC-BY kit models
// (street lamps, vending machines, wall signs, traffic lights) carry the
// close-up detail at street level. Own loader — no prism imports.

import * as THREE from 'three'
import { mulberry32 } from './kit'
import type { Rail } from './rail'

export interface PropsHandle {
  group: THREE.Group
  dispose(): void
}

interface ItemDef {
  url: string
  /** target height in metres */
  h: number
  /** mount height (0 = on the ground) */
  y?: number
  /** lateral distance from the street centreline */
  lat: number
  /** weight in the rotation */
  w: number
  /** lightest tier this item may appear on (2 = light list only) */
  tier: 1 | 2
}

const ITEMS: ItemDef[] = [
  { url: '/models/district/lamp-curve.glb', h: 6.4, lat: 5.4, w: 3, tier: 2 },
  { url: '/models/district/lamp-straight.glb', h: 6.0, lat: 5.6, w: 3, tier: 2 },
  { url: '/models/district/vending.glb', h: 2.3, lat: 6.2, w: 2, tier: 2 },
  { url: '/models/district/signs.glb', h: 7, y: 3.2, lat: 7.2, w: 1.4, tier: 2 },
  { url: '/models/district/neon-signs.glb', h: 11, y: 4.2, lat: 7.5, w: 1.2, tier: 1 },
  { url: '/models/district/traffic-light.glb', h: 4.8, lat: 5.6, w: 1, tier: 1 },
  { url: '/models/district/lantern.glb', h: 0.9, y: 4.1, lat: 6.6, w: 0.8, tier: 1 },
  { url: '/models/district/ramen.glb', h: 3.4, lat: 6.0, w: 0.7, tier: 1 },
]

interface Spot {
  x: number
  z: number
  y: number
  yaw: number
  url: string
}

interface Template {
  root: THREE.Object3D
  s: number
  cx: number
  minY: number
  cz: number
}

export function createProps(opts: { rail: Rail, seed: number, tier: number }): PropsHandle {
  const { rail, tier } = opts
  const group = new THREE.Group()
  group.name = 'skyline-props'
  const rand = mulberry32((opts.seed ^ 0x9e3779b9) >>> 0)
  let live = true

  const pool = ITEMS.filter((i) => tier <= i.tier)
  const total = pool.reduce((s, i) => s + i.w, 0)

  // spots along the street-level stretch of the flight
  const p = new THREE.Vector3()
  const d = new THREE.Vector3()
  const spots: Spot[] = []
  for (let arc = 0; arc < rail.length; arc += 24) {
    rail.sample(arc, p, d)
    if (p.y > 30 || p.y < 3) continue
    if (rand() < 0.28) continue
    let r = rand() * total
    let def = pool[0]!
    for (const item of pool) {
      r -= item.w
      if (r <= 0) {
        def = item
        break
      }
    }
    const side = rand() < 0.5 ? -1 : 1
    const lat = def.lat * (0.9 + rand() * 0.25)
    const px = p.x + -d.z * lat * side
    const pz = p.z + d.x * lat * side
    const hit = rail.nearest(px, pz)
    const yaw = Math.atan2(hit.cx - px, hit.cz - pz) + (rand() - 0.5) * 0.5
    spots.push({ x: px, z: pz, y: def.y ?? 0, yaw, url: def.url })
  }

  const templates = new Map<string, Template>()
  const placed = new Set<string>()

  function place(url: string) {
    const t = templates.get(url)
    if (!live || !t || placed.has(url)) return
    placed.add(url)
    for (const s of spots) {
      if (s.url !== url) continue
      const outer = new THREE.Group()
      outer.position.set(s.x, s.y, s.z)
      outer.rotation.y = s.yaw
      outer.scale.setScalar(t.s)
      const inner = t.root.clone()
      inner.position.set(-t.cx, -t.minY, -t.cz)
      outer.add(inner)
      group.add(outer)
    }
  }

  void (async () => {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const loader = new GLTFLoader()
    const urls = [...new Set(spots.map((s) => s.url))]
    for (const url of urls) {
      try {
        const gltf = await loader.loadAsync(url)
        if (!live) return
        const root = gltf.scene
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh
          if (!mesh.isMesh) return
          const old = mesh.material as THREE.MeshStandardMaterial
          const next = new THREE.MeshBasicMaterial({
            map: old.map ?? null,
            color: old.color ? old.color.clone() : new THREE.Color(1, 1, 1),
            transparent: old.transparent,
            opacity: old.opacity ?? 1,
            side: old.side,
            toneMapped: true,
          })
          mesh.material = next
          old.dispose?.()
        })
        const box = new THREE.Box3().setFromObject(root)
        const size = box.getSize(new THREE.Vector3())
        const h = ITEMS.find((i) => i.url === url)?.h ?? 3
        templates.set(url, {
          root,
          s: h / Math.max(size.y, 0.001),
          cx: box.min.x + size.x / 2,
          minY: box.min.y,
          cz: box.min.z + size.z / 2,
        })
        place(url)
      } catch {
        // a missing prop never breaks the flight
      }
    }
  })()

  const dispose = () => {
    live = false
    for (const t of templates.values()) {
      t.root.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.geometry?.dispose()
          const mat = m.material as THREE.MeshBasicMaterial
          mat?.map?.dispose()
          mat?.dispose()
        }
      })
    }
    templates.clear()
    group.clear()
  }

  return { group, dispose }
}
