// SKYLINE — the city builder.
// Procedural towers in a 42m grid: dark boxes, neon edge lines (five offset
// copies so the 1px GL lines read as tubes), sparse windows, street glow and a
// mirrored copy of every line for the wet-ground reflection. The builder also
// returns "slots" — facade / roof / street anchors ranked by how close they sit
// to the flight corridor — which the landmarks layer uses to mount the data.

import * as THREE from 'three'
import { mulberry32, pickNeon, NEON, neonVec, type NeonName } from './kit'
import { LAYOUT, PAD, PAD_CELL, cellKey, cellX, cellZ, type Rail } from './rail'

export interface FacadeSlot {
  x: number
  y: number
  z: number
  /** rotate Y so the plane's +Z faces away from the wall / toward the flight */
  yaw: number
  /** usable width on this face */
  w: number
  arc: number
  dist: number
  kind: 'facade' | 'roof' | 'street'
}

export interface CityBuild {
  group: THREE.Group
  slots: FacadeSlot[]
  /** tower volumes, for line-of-sight checks when mounting the data signs */
  towers: ReadonlyArray<{ x: number, z: number, w: number, d: number, h: number }>
  dispose(): void
}

interface Tower {
  x: number
  z: number
  w: number
  d: number
  h: number
  edge: NeonName | null
  band: NeonName
  rim: NeonName
}

export interface CityOpts {
  seed: number
  rail: Rail
  /** window instance budget (quality tier) */
  windowBudget: number
  /** build the distant skyline ring */
  far: boolean
  /** build windows at all (mobile low tier still gets them, just fewer) */
  windows: boolean
}

const SIDE_YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2]

export function buildCity(opts: CityOpts): CityBuild {
  const { seed, rail, windowBudget, far } = opts
  const rand = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'skyline-city'
  const disposables: Array<{ dispose(): void }> = []

  /* ------------------------------------------------------------- towers ---- */

  const towers: Tower[] = []
  const padX = cellX(PAD_CELL.ix)
  const padZ = cellZ(PAD_CELL.iz)

  const heightFor = (ix: number, iz: number, r: number) => {
    const central = Math.abs(ix - 4) <= 2 && Math.abs(iz - 5.5) <= 3 ? 1.22 : 1
    let h: number
    if (r < 0.24) h = 16 + rand() * 30
    else if (r < 0.82) h = 34 + Math.pow(rand(), 1.7) * 92
    else h = 118 + Math.pow(rand(), 1.4) * 108
    h *= central
    const cap = LAYOUT.caps[cellKey(ix, iz)]
    if (cap) h = Math.min(h, cap)
    return h
  }

  for (let iz = 0; iz < LAYOUT.rows; iz++) {
    for (let ix = 0; ix < LAYOUT.cols; ix++) {
      const cx = cellX(ix)
      const cz = cellZ(iz)
      const half = LAYOUT.block / 2

      if (ix === PAD_CELL.ix && iz === PAD_CELL.iz) {
        // the gate tower — exact roof height, nothing else on the cell
        towers.push({ x: padX, z: padZ, w: 13, d: 13, h: PAD.roofY, edge: 'cyan', band: 'magenta', rim: 'magenta' })
        continue
      }

      const roll = rand()
      const count = roll < 0.44 ? 1 : roll < 0.78 ? 2 : 3 + (rand() < 0.4 ? 1 : 0)
      const spots: Array<[number, number, number, number]> = []

      if (count === 1) {
        const w = 19 + rand() * 6.5
        const d = 19 + rand() * 6.5
        spots.push([0, 0, w, d])
      } else if (count === 2) {
        const along = rand() < 0.5
        const w1 = 13 + rand() * 9
        const w2 = Math.min(half * 2, 26 - w1) * (0.72 + rand() * 0.26)
        if (along) {
          spots.push([-(half - w1 / 2) + 0.6, 0, w1, 20 + rand() * 5])
          spots.push([half - w2 / 2 - 0.6, 0, w2, 20 + rand() * 5])
        } else {
          spots.push([0, -(half - (13 + rand() * 6) / 2) + 0.6, 20 + rand() * 5, 13 + rand() * 6])
          spots.push([0, half - (13 + rand() * 6) / 2 - 0.6, 20 + rand() * 5, 13 + rand() * 6])
        }
      } else {
        const quads: Array<[number, number]> = [
          [-1, -1], [1, -1], [-1, 1], [1, 1],
        ]
        for (let q = 0; q < count; q++) {
          const [sx, sz] = quads[q]!
          const w = 9.5 + rand() * 3
          const d = 9.5 + rand() * 3
          spots.push([sx * (half - w / 2 - 0.8) * (0.92 + rand() * 0.08), sz * (half - d / 2 - 0.8) * (0.92 + rand() * 0.08), w, d])
        }
      }

      for (const [ox, oz, w, d] of spots) {
        const h = heightFor(ix, iz, rand())
        const dark = rand() < 0.22
        towers.push({
          x: cx + ox,
          z: cz + oz,
          w,
          d,
          h,
          edge: dark ? null : pickNeon(rand),
          band: pickNeon(rand),
          rim: pickNeon(rand),
        })
      }
    }
  }

  /* ---------------------------------------------------------- boxes mesh --- */

  const boxGeo = new THREE.BoxGeometry(1, 1, 1)
  boxGeo.translate(0, 0.5, 0)
  const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const boxes = new THREE.InstancedMesh(boxGeo, boxMat, towers.length)
  boxes.name = 'towers'
  const m4 = new THREE.Matrix4()
  const v3 = new THREE.Vector3()
  const q0 = new THREE.Quaternion()
  const s3 = new THREE.Vector3()
  const dim = new THREE.Color()
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i]!
    v3.set(t.x, -0.6, t.z)
    s3.set(t.w, t.h, t.d)
    m4.compose(v3, q0, s3)
    boxes.setMatrixAt(i, m4)
    const tone = 0.62 + rand() * 0.5
    dim.setRGB(0.045 * tone, 0.056 * tone, 0.085 * tone)
    boxes.setColorAt(i, dim)
  }
  boxes.instanceMatrix.needsUpdate = true
  if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true
  group.add(boxes)
  disposables.push(boxGeo, boxMat)

  /* --------------------------------------------------------- neon lines ---- */

  const pos: number[] = []
  const col: number[] = []
  const seg = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: NeonName, mul: number) => {
    pos.push(x1, y1, z1, x2, y2, z2)
    const n = NEON[c]
    col.push(n.r * mul, n.g * mul, n.b * mul, n.r * mul, n.g * mul, n.b * mul)
  }

  for (const t of towers) {
    const x0 = t.x - t.w / 2
    const x1 = t.x + t.w / 2
    const z0 = t.z - t.d / 2
    const z1 = t.z + t.d / 2
    const top = t.h

    if (t.edge) {
      seg(x0, 2, z0, x0, top, z0, t.edge, 0.95 + rand() * 0.3)
      seg(x1, 2, z1, x1, top, z1, t.edge, 0.95 + rand() * 0.3)
      seg(x0, 2, z1, x0, top, z1, t.edge, 0.8 + rand() * 0.25)
      seg(x1, 2, z0, x1, top, z0, t.edge, 0.8 + rand() * 0.25)
      // rooftop rim
      const rimMul = 0.8 + rand() * 0.35
      seg(x0, top, z0, x1, top, z0, t.rim, rimMul)
      seg(x1, top, z0, x1, top, z1, t.rim, rimMul)
      seg(x1, top, z1, x0, top, z1, t.rim, rimMul)
      seg(x0, top, z1, x0, top, z0, t.rim, rimMul)
      // horizontal light bands
      const bands = Math.floor(t.h / 26)
      for (let b = 1; b <= bands; b++) {
        if (rand() > 0.42) continue
        const y = 8 + b * 24
        const mulB = 0.28 + rand() * 0.3
        if (rand() < 0.55) {
          seg(x0, y, z0, x1, y, z0, t.band, mulB * 0.8)
          seg(x0, y, z1, x1, y, z1, t.band, mulB * 0.8)
        } else {
          seg(x0, y, z0, x0, y, z1, t.band, mulB * 0.8)
          seg(x1, y, z0, x1, y, z1, t.band, mulB * 0.8)
        }
      }
    }
    // street-level neon strip — every tower glows a little at the bottom
    const low = 0.5 + rand() * 0.9 + (t.edge ? 0.5 : 0)
    seg(x0, 2.2, z0, x1, 2.2, z0, t.rim, low)
    seg(x0, 2.2, z1, x1, 2.2, z1, t.rim, low)
    seg(x0, 2.2, z0, x0, 2.2, z1, t.band, low)
    seg(x1, 2.2, z0, x1, 2.2, z1, t.band, low)
  }

  /* ------------------------------------------------------ street glow ------ */

  const gx0 = -LAYOUT.cols / 2 * LAYOUT.pitch + 3
  const gx1 = LAYOUT.cols / 2 * LAYOUT.pitch - 3
  const gz0 = -LAYOUT.rows / 2 * LAYOUT.pitch + 3
  const gz1 = LAYOUT.rows / 2 * LAYOUT.pitch - 3
  for (let k = 0; k < 10; k++) {
    const x = -189 + k * 42
    seg(x, 0.07, gz0, x, 0.07, gz1, k % 2 ? 'cyan' : 'blue', 0.4 + rand() * 0.25)
  }
  for (let k = 0; k < 11; k++) {
    const z = -210 + k * 42
    seg(gx0, 0.07, z, gx1, 0.07, z, k % 2 ? 'blue' : 'cyan', 0.34 + rand() * 0.22)
  }

  // approach lane — the runway glow under the flight's entry, outside the grid
  for (const lx of [-28, -14]) {
    seg(lx, 0.07, 250, lx, 0.07, 336, 'cyan', 0.5 + rand() * 0.2)
  }
  for (let z = 256; z <= 332; z += 19) {
    seg(-28, 0.07, z, -14, 0.07, z, 'blue', 0.3 + rand() * 0.14)
  }

  /* ----------------------------------------------------------- the pad ----- */

  const padMat = new THREE.MeshBasicMaterial({ color: 0x0b101d })
  const slabGeo = new THREE.BoxGeometry(PAD.half * 2, PAD.slab, PAD.half * 2)
  const slab = new THREE.Mesh(slabGeo, padMat)
  slab.position.set(PAD.x, PAD.roofY - PAD.slab / 2, PAD.z)
  group.add(slab)
  disposables.push(slabGeo, padMat)

  {
    const px0 = PAD.x - PAD.half
    const px1 = PAD.x + PAD.half
    const pz0 = PAD.z - PAD.half
    const pz1 = PAD.z + PAD.half
    const y = PAD.roofY + 0.02
    seg(px0, y, pz0, px1, y, pz0, 'magenta', 2.1)
    seg(px1, y, pz0, px1, y, pz1, 'magenta', 2.1)
    seg(px1, y, pz1, px0, y, pz1, 'cyan', 1.7)
    seg(px0, y, pz1, px0, y, pz0, 'cyan', 1.7)
    // inner ring
    const r = PAD.half - 2.4
    seg(PAD.x - r, y + 0.02, PAD.z - r, PAD.x + r, y + 0.02, PAD.z - r, 'cyan', 1.1)
    seg(PAD.x + r, y + 0.02, PAD.z - r, PAD.x + r, y + 0.02, PAD.z + r, 'cyan', 1.1)
    seg(PAD.x + r, y + 0.02, PAD.z + r, PAD.x - r, y + 0.02, PAD.z + r, 'cyan', 1.1)
    seg(PAD.x - r, y + 0.02, PAD.z + r, PAD.x - r, y + 0.02, PAD.z - r, 'cyan', 1.1)
  }

  /* --------------------------------------------------------- far skyline --- */

  if (far) {
    const farCount = 74
    const farGeo = new THREE.BoxGeometry(1, 1, 1)
    farGeo.translate(0, 0.5, 0)
    const farMat = new THREE.MeshBasicMaterial({ color: 0x05070e })
    const farMesh = new THREE.InstancedMesh(farGeo, farMat, farCount)
    for (let i = 0; i < farCount; i++) {
      const a = (i / farCount) * Math.PI * 2 + rand() * 0.12
      const radius = 380 + rand() * 620
      const x = Math.sin(a) * radius
      const z = Math.cos(a) * radius
      const w = 34 + rand() * 90
      const d = 34 + rand() * 90
      const h = 50 + Math.pow(rand(), 1.5) * 230
      v3.set(x, 0, z)
      s3.set(w, h, d)
      m4.compose(v3, q0, s3)
      farMesh.setMatrixAt(i, m4)
      if (rand() < 0.85) {
        const c = pickNeon(rand)
        const mul = 0.28 + rand() * 0.35
        seg(x - w / 2, 4, z - d / 2, x - w / 2, h, z - d / 2, c, mul)
        seg(x + w / 2, 4, z + d / 2, x + w / 2, h, z + d / 2, c, mul)
        if (rand() < 0.7) {
          seg(x - w / 2, h, z - d / 2, x + w / 2, h, z - d / 2, c, mul * 1.1)
          seg(x + w / 2, h, z + d / 2, x - w / 2, h, z + d / 2, c, mul * 1.1)
        }
      }
    }
    farMesh.instanceMatrix.needsUpdate = true
    group.add(farMesh)
    disposables.push(farGeo, farMat)
  }

  /* ------------------------------------- bake the lines (five offset copies) */

  const baseCount = pos.length / 3
  const copies: Array<[number, number, number, number]> = [
    [0, 0, 0, 0.55],
    [0.075, 0.075, 0, 0.16],
    [-0.075, 0.075, 0, 0.16],
    [0.075, -0.075, 0, 0.16],
    [-0.075, -0.075, 0, 0.16],
  ]
  const totalVerts = baseCount * copies.length
  const lpos = new Float32Array(totalVerts * 3)
  const lcol = new Float32Array(totalVerts * 3)
  let w = 0
  for (const [ox, oy, oz, cm] of copies) {
    for (let i = 0; i < baseCount; i++) {
      const p = i * 3
      lpos[w] = pos[p]! + ox
      lpos[w + 1] = pos[p + 1]! + oy
      lpos[w + 2] = pos[p + 2]! + oz
      lcol[w] = col[p]! * cm
      lcol[w + 1] = col[p + 1]! * cm
      lcol[w + 2] = col[p + 2]! * cm
      w += 3
    }
  }
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3))
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lcol, 3))
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const lines = new THREE.LineSegments(lineGeo, lineMat)
  lines.name = 'neon'
  lines.renderOrder = 1
  group.add(lines)
  disposables.push(lineGeo, lineMat)

  // mirrored copy — the reflection in the wet ground
  const mirrorMat = lineMat.clone()
  mirrorMat.opacity = 0.2
  const mirror = new THREE.LineSegments(lineGeo, mirrorMat)
  mirror.scale.set(1, -1, 1)
  mirror.renderOrder = -1
  group.add(mirror)
  disposables.push(mirrorMat)

  /* ------------------------------------------------------------- ground ---- */

  const groundGeo = new THREE.PlaneGeometry(2900, 2900)
  const groundMat = new THREE.MeshBasicMaterial({
    color: 0x04050c,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.renderOrder = -2
  group.add(ground)
  disposables.push(groundGeo, groundMat)

  /* ------------------------------------------------------------ windows ---- */

  interface WinSpec {
    x: number
    y: number
    z: number
    yaw: number
    sw: number
    sh: number
    r: number
    g: number
    b: number
  }
  const wins: WinSpec[] = []
  if (opts.windows) {
    outer: for (const t of towers) {
      for (const yaw of SIDE_YAW) {
        const nx = Math.sin(yaw)
        const nz = Math.cos(yaw)
        const along = yaw === 0 || yaw === Math.PI ? t.w : t.d
        const off = (yaw === 0 || yaw === Math.PI ? t.d : t.w) / 2
        const cols = Math.max(1, Math.floor((along - 3) / 3.7))
        const rows = Math.min(15, Math.floor((t.h - 6) / 4.4))
        if (rows < 2) continue
        const near = rail.nearest(t.x, t.z).dist < 150
        const density = near ? 0.2 : 0.075
        for (let cI = 0; cI < cols; cI++) {
          for (let rI = 0; rI < rows; rI++) {
            if (rand() > density) continue
            if (wins.length >= windowBudget) break outer
            const u = (cI + 0.5) / cols - 0.5
            const wx = t.x + (yaw === 0 || yaw === Math.PI ? u * t.w : nx * off)
            const wz = t.z + (yaw === 0 || yaw === Math.PI ? nz * off : u * t.d)
            const wy = 5 + rI * 4.4 + rand() * 0.8
            const roll = rand()
            let r: number
            let g: number
            let b: number
            if (roll < 0.6) {
              const m = 0.2 + rand() * 0.32
              r = 0.24 * m
              g = 0.58 * m
              b = 0.95 * m
            } else if (roll < 0.8) {
              const m = 0.26 + rand() * 0.3
              r = 0.95 * m
              g = 0.58 * m
              b = 0.24 * m
            } else if (roll < 0.92) {
              const m = 0.2 + rand() * 0.22
              r = 0.9 * m
              g = 0.3 * m
              b = 0.75 * m
            } else {
              r = 0.35
              g = 0.45
              b = 0.58
            }
            wins.push({
              x: wx + nx * 0.12,
              y: wy,
              z: wz + nz * 0.12,
              yaw,
              sw: 0.85 + rand() * 0.6,
              sh: 1.2 + rand() * 0.7,
              r,
              g,
              b,
            })
          }
        }
      }
    }
  }

  if (wins.length) {
    const winGeo = new THREE.PlaneGeometry(1, 1)
    const winMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const winMesh = new THREE.InstancedMesh(winGeo, winMat, wins.length)
    winMesh.renderOrder = 2
    const qw = new THREE.Quaternion()
    const axisY = new THREE.Vector3(0, 1, 0)
    const cw = new THREE.Color()
    for (let i = 0; i < wins.length; i++) {
      const s = wins[i]!
      v3.set(s.x, s.y, s.z)
      qw.setFromAxisAngle(axisY, s.yaw)
      s3.set(s.sw, s.sh, 1)
      m4.compose(v3, qw, s3)
      winMesh.setMatrixAt(i, m4)
      cw.setRGB(s.r, s.g, s.b)
      winMesh.setColorAt(i, cw)
    }
    winMesh.instanceMatrix.needsUpdate = true
    if (winMesh.instanceColor) winMesh.instanceColor.needsUpdate = true
    group.add(winMesh)
    disposables.push(winGeo, winMat)
  }

  /* -------------------------------------------------------------- slots ---- */

  const slots: FacadeSlot[] = []
  const shp = new THREE.Vector3()
  const shd = new THREE.Vector3()
  for (const t of towers) {
    for (const yaw of SIDE_YAW) {
      const nx = Math.sin(yaw)
      const nz = Math.cos(yaw)
      const along = yaw === 0 || yaw === Math.PI ? t.w : t.d
      const off = (yaw === 0 || yaw === Math.PI ? t.d : t.w) / 2
      const px = t.x + nx * off
      const pz = t.z + nz * off
      const at = rail.nearest(px, pz)
      if (at.dist > 132) continue

      // a data sign only earns a wall that the incoming camera can read —
      // i.e. one whose normal faces back down the flight
      rail.sample(Math.min(rail.length, at.arc * rail.length), shp, shd)
      const align = nx * -shd.x + nz * -shd.z

      if (align > 0.35 && t.h > 26 && along >= 10) {
        slots.push({
          x: px,
          y: Math.min(t.h - 7, t.h * 0.4 + 9),
          z: pz,
          yaw,
          w: along - 1.5,
          arc: at.arc,
          dist: at.dist,
          kind: 'facade',
        })
        if (t.h > 66 && along >= 13) {
          slots.push({
            x: px,
            y: t.h * 0.78,
            z: pz,
            yaw,
            w: along - 1.5,
            arc: at.arc,
            dist: at.dist,
            kind: 'facade',
          })
        }
      }
      // shopfronts: any near wall (even side-on) but never one facing away
      if (at.dist < 26 && along >= 8 && align > -0.25) {
        slots.push({
          x: px,
          y: 6.4,
          z: pz,
          yaw,
          w: along - 1.5,
          arc: at.arc,
          dist: at.dist,
          kind: 'street',
        })
      }
    }
    if (t.h > 42) {
      const hit = rail.nearest(t.x, t.z)
      const hp = new THREE.Vector3()
      const hd = new THREE.Vector3()
      rail.sample(Math.min(rail.length, hit.arc * rail.length), hp, hd)
      slots.push({
        x: t.x,
        y: t.h + 5.5,
        z: t.z,
        // face back up the flight — the incoming camera reads it head-on
        yaw: Math.atan2(-hd.x, -hd.z),
        w: Math.max(t.w, t.d) - 2,
        arc: hit.arc,
        dist: hit.dist,
        kind: 'roof',
      })
    }
  }

  slots.sort((a, b) => a.dist - b.dist)
  const capped = slots.slice(0, 460)

  const dispose = () => {
    for (const d of disposables) d.dispose()
    group.clear()
  }

  return { group, slots: capped, towers, dispose }
}
