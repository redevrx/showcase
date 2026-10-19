// PRISM — district props.
// Real low-poly models dropped into the district: the rabbit mascot (skinned,
// animated), floating city structures, and now the jinja-noir street kit —
// torii gates, stone lanterns, kitsune guardians, chochin strings, bamboo,
// shouji doors, vending walls, a sushi truck and a giant ramen bowl.
// Streamed in after the first frame so the entrance stays cheap; materials are
// converted to unlit MeshBasicMaterial because the scene runs lightless
// (everything is emissive shader work) and the post pass dithers it all into
// the same 15-bit neon night.
//
// Credits (all via poly.pizza):
//   CC0 — Quaternius (platforms, signs, torii, street lights, traffic cone,
//         ramen, sushi truck, cyberpunk signs, ninja, fox statue, bamboo,
//         japanese door), Kay Lousberg (traffic light, hanging lantern),
//         iPoly3D (shuriken), JMHDE (chochin lantern)
//   CC-BY — dook (vending machine), Flopsi (stone lamp)

import type * as ThreeNS from 'three'

export interface PropDef {
  name: string
  url: string
  x: number
  y: number
  z: number
  /** normalise the model to this size in world units */
  size: number
  /** measure against height instead of width */
  byHeight?: boolean
  yaw?: number
  pitch?: number
  /** material brightness multiplier */
  tint?: number
  /** clip name (last segment) to play when the model is animated */
  anim?: string
  /** vertical bob amplitude (world units) */
  bob?: number
  /** idle yaw sway amplitude (radians) */
  sway?: number
  /** continuous yaw spin (radians / second) */
  spin?: number
  /** mirror the prop under the floor */
  mirror?: boolean
  /** replace all materials with a flat bright color (unlit signage — readable on a dark sky) */
  flat?: string
  /** phase offset for idle motion */
  phase?: number
  /** extra copies of the same model, placed relative to (x, z) — static only */
  cluster?: Array<{ dx: number; dz: number; dy?: number; yaw?: number; scale?: number }>
  /** skipped under reduced motion / low-power mode */
  heavy?: boolean
  /** rides the camera between stations (shuriken fly-by) */
  fly?: boolean
}

export interface PropHandle {
  update(clock: number, dt: number): void
  dispose(): void
  count(): number
  /** dev only — where the camera-riding shuriken is right now */
  flyer(): { visible: boolean; x: number; y: number; z: number } | null
}

/** the district cast — positions are hand-placed against the billboard rings */
export const DISTRICT_PROPS: PropDef[] = [
  // the mascot — a white rabbit in a suit, idling at street level
  {
    name: 'rabbit',
    url: '/models/district/mascot-rabbit-idle.glb',
    x: 1.05,
    y: 0.72,
    z: -1.15,
    size: 1.12,
    byHeight: true,
    yaw: 0.24,
    anim: 'Idle',
    bob: 0.045,
    sway: 0.09,
  },
  // floating structures carrying their own neon signage — one per stretch
  {
    name: 'platform-a',
    url: '/models/district/platform-a.glb',
    x: 8.0,
    y: 4.2,
    z: -12.5,
    size: 6.2,
    yaw: -0.5,
    tint: 0.95,
    mirror: true,
    bob: 0.12,
    phase: 1.1,
  },
  {
    name: 'platform-c',
    url: '/models/district/platform-c.glb',
    x: -8.2,
    y: 3.0,
    z: -24.5,
    size: 5.4,
    yaw: 0.55,
    tint: 0.8,
    mirror: true,
    bob: 0.1,
    phase: 2.4,
  },
  {
    name: 'platform-d',
    url: '/models/district/platform-d.glb',
    x: 8.6,
    y: 5.6,
    z: -38.5,
    size: 6.6,
    yaw: -0.55,
    tint: 0.7,
    mirror: true,
    bob: 0.14,
    phase: 3.7,
  },

  /* ————— the jinja-noir street: gates, lamps, lanterns ————— */

  // torii gates — the avenue walks through two of them
  { name: 'torii-1', url: '/models/district/torii.glb', x: 0, y: 0, z: -6.8, size: 7.6, tint: 1.0, mirror: true },
  { name: 'torii-2', url: '/models/district/torii.glb', x: 0, y: 0, z: -35.4, size: 7.0, tint: 1.05, mirror: true },

  // street lamps — curved on the left, straight on the right
  {
    name: 'lamps-left',
    url: '/models/district/lamp-curve.glb',
    x: -5.25,
    y: 0,
    z: 0,
    size: 4.7,
    byHeight: true,
    tint: 1.05,
    yaw: Math.PI / 2,
    cluster: [
      { dx: 0, dz: -5.5 },
      { dx: 0, dz: -13.5 },
      { dx: 0, dz: -22.8 },
      { dx: 0, dz: -26.8 },
      { dx: 0, dz: -39.8 },
      { dx: 0, dz: -46.8 },
      { dx: 0, dz: -53.5 },
    ],
  },
  {
    name: 'lamps-right',
    url: '/models/district/lamp-straight.glb',
    x: 5.3,
    y: 0,
    z: 0,
    size: 4.7,
    byHeight: true,
    tint: 1.05,
    yaw: -Math.PI / 2,
    cluster: [
      { dx: 0, dz: -9.8 },
      { dx: 0, dz: -17.8 },
      { dx: 0, dz: -25.6 },
      { dx: 0, dz: -33.6 },
      { dx: 0, dz: -41.6 },
      { dx: 0, dz: -49.6 },
      { dx: 0, dz: -57.0 },
    ],
  },

  // chochin strings — chochin red / warm paper alternating, hung across the street
  {
    name: 'chochin-1',
    url: '/models/district/lantern.glb',
    x: 0,
    y: 3.32,
    z: -8.2,
    size: 0.68,
    byHeight: true,
    tint: 1.25,
    mirror: true,
    sway: 0.03,
    cluster: [
      { dx: -3.6, dz: 0, dy: 0.05 },
      { dx: -1.8, dz: 0, dy: -0.06 },
      { dx: 0, dz: 0, dy: -0.14 },
      { dx: 1.8, dz: 0, dy: -0.06 },
      { dx: 3.6, dz: 0, dy: 0.05 },
    ],
  },
  {
    name: 'chochin-2',
    url: '/models/district/lantern-warm.glb',
    x: 0,
    y: 3.32,
    z: -20.6,
    size: 0.64,
    byHeight: true,
    tint: 1.2,
    mirror: true,
    sway: 0.03,
    phase: 1.3,
    cluster: [
      { dx: -3.6, dz: 0, dy: 0.05 },
      { dx: -1.8, dz: 0, dy: -0.06 },
      { dx: 0, dz: 0, dy: -0.14 },
      { dx: 1.8, dz: 0, dy: -0.06 },
      { dx: 3.6, dz: 0, dy: 0.05 },
    ],
  },
  {
    name: 'chochin-3',
    url: '/models/district/lantern.glb',
    x: 0,
    y: 3.32,
    z: -31.5,
    size: 0.68,
    byHeight: true,
    tint: 1.25,
    mirror: true,
    sway: 0.03,
    phase: 2.1,
    cluster: [
      { dx: -3.6, dz: 0, dy: 0.05 },
      { dx: -1.8, dz: 0, dy: -0.06 },
      { dx: 0, dz: 0, dy: -0.14 },
      { dx: 1.8, dz: 0, dy: -0.06 },
      { dx: 3.6, dz: 0, dy: 0.05 },
    ],
  },
  {
    name: 'chochin-4',
    url: '/models/district/lantern-warm.glb',
    x: 0,
    y: 3.32,
    z: -43.0,
    size: 0.64,
    byHeight: true,
    tint: 1.2,
    mirror: true,
    sway: 0.03,
    phase: 3.4,
    cluster: [
      { dx: -3.6, dz: 0, dy: 0.05 },
      { dx: -1.8, dz: 0, dy: -0.06 },
      { dx: 0, dz: 0, dy: -0.14 },
      { dx: 1.8, dz: 0, dy: -0.06 },
      { dx: 3.6, dz: 0, dy: 0.05 },
    ],
  },

  // traffic lights at the two crossings
  { name: 'signal-1', url: '/models/district/traffic-light.glb', x: -5.55, y: 0, z: -9.6, size: 4.1, byHeight: true, yaw: Math.PI / 2, tint: 1.1 },
  { name: 'signal-2', url: '/models/district/traffic-light.glb', x: 5.55, y: 0, z: -37.6, size: 4.1, byHeight: true, yaw: -Math.PI / 2, tint: 1.1 },

  // shrine guardians under the second gate
  { name: 'fox-l', url: '/models/district/kitsune.glb', x: -3.15, y: 0, z: -34.8, size: 1.3, byHeight: true, yaw: -0.3, tint: 0.96 },
  { name: 'fox-r', url: '/models/district/kitsune.glb', x: 3.15, y: 0, z: -34.8, size: 1.3, byHeight: true, yaw: 0.3, tint: 0.96 },

  // stone lanterns flanking the first and last gate
  {
    name: 'toro-1',
    url: '/models/district/stone-lamp.glb',
    x: -3.35,
    y: 0,
    z: -5.75,
    size: 1.45,
    byHeight: true,
    tint: 0.8,
    cluster: [{ dx: 0, dz: 0 }, { dx: 6.7, dz: 0 }],
  },
  {
    name: 'toro-2',
    url: '/models/district/stone-lamp.glb',
    x: -3.15,
    y: 0,
    z: -62.6,
    size: 1.45,
    byHeight: true,
    tint: 0.8,
    cluster: [{ dx: 0, dz: 0 }, { dx: 6.3, dz: 0 }],
  },

  // the ninja patrol — one guards the first gate, one the last
  {
    name: 'ninja-1',
    url: '/models/district/ninja.glb',
    x: -3.05,
    y: 0,
    z: -6.9,
    size: 1.62,
    byHeight: true,
    yaw: 0.55,
    tint: 1.15,
    anim: 'Idle',
  },
  {
    name: 'ninja-2',
    url: '/models/district/ninja.glb',
    x: 2.15,
    y: 0,
    z: -61.8,
    size: 1.62,
    byHeight: true,
    yaw: -0.6,
    tint: 1.15,
    anim: 'Idle',
  },

  // bamboo pockets at the street edges
  {
    name: 'bamboo-1',
    url: '/models/district/bamboo.glb',
    x: -7.1,
    y: 0,
    z: -10.2,
    size: 2.8,
    byHeight: true,
    tint: 0.9,
    heavy: true,
    cluster: [{ dx: 0, dz: 0 }, { dx: 0.5, dz: -0.5 }, { dx: -0.4, dz: -1.1 }],
  },
  {
    name: 'bamboo-2',
    url: '/models/district/bamboo.glb',
    x: 7.0,
    y: 0,
    z: -16.5,
    size: 2.8,
    byHeight: true,
    tint: 0.9,
    heavy: true,
    cluster: [{ dx: 0, dz: 0 }, { dx: 0.5, dz: -0.6 }],
  },
  {
    name: 'bamboo-3',
    url: '/models/district/bamboo.glb',
    x: -7.0,
    y: 0,
    z: -41.8,
    size: 2.8,
    byHeight: true,
    tint: 0.9,
    heavy: true,
    cluster: [{ dx: 0, dz: 0 }, { dx: 0.45, dz: -0.5 }],
  },
  {
    name: 'bamboo-4',
    url: '/models/district/bamboo.glb',
    x: 6.9,
    y: 0,
    z: -48.5,
    size: 2.8,
    byHeight: true,
    tint: 0.9,
    heavy: true,
    cluster: [{ dx: 0, dz: 0 }, { dx: 0.5, dz: -0.55 }],
  },

  // vending walls
  {
    name: 'vending-1',
    url: '/models/district/vending.glb',
    x: -5.05,
    y: 0,
    z: -12.4,
    size: 2.15,
    byHeight: true,
    yaw: 1.35,
    tint: 0.95,
    mirror: true,
    cluster: [{ dx: 0, dz: 0 }, { dx: 0, dz: -1.2 }],
  },
  {
    name: 'vending-2',
    url: '/models/district/vending.glb',
    x: 5.15,
    y: 0,
    z: -26.2,
    size: 2.15,
    byHeight: true,
    yaw: -1.35,
    tint: 0.95,
    mirror: true,
  },

  // the food corner — sushi truck parked at the kerb, ramen bowl on the left
  {
    name: 'sushi-truck',
    url: '/models/district/sushi-truck.glb',
    x: 6.25,
    y: 0,
    z: -23.6,
    size: 5.8,
    yaw: -1.15,
    tint: 0.82,
    mirror: true,
    heavy: true,
  },
  { name: 'ramen-bowl', url: '/models/district/ramen.glb', x: -6.1, y: 0, z: -27.6, size: 2.7, tint: 1.15, mirror: true },

  // shouji doors propped against the kerb walls
  { name: 'shouji-1', url: '/models/district/jap-door.glb', x: -5.95, y: 0, z: -37.8, size: 2.3, byHeight: true, yaw: 1.0, tint: 1.0, mirror: true, heavy: true },
  { name: 'shouji-2', url: '/models/district/jap-door.glb', x: 6.0, y: 0, z: -44.6, size: 2.3, byHeight: true, yaw: -1.0, tint: 1.0, mirror: true, heavy: true },

  // street-level dressing — scattered along the walk
  {
    name: 'signs',
    url: '/models/district/signs.glb',
    x: -6.2,
    y: 0.04,
    z: -22.6,
    size: 2.6,
    yaw: 0.38,
    tint: 0.95,
    mirror: true,
  },
  {
    name: 'essentials',
    url: '/models/district/essentials.glb',
    x: 5.9,
    y: 0.02,
    z: -27.5,
    size: 2.4,
    yaw: -0.34,
    tint: 0.9,
  },

  // traffic cones — a roadwork trio by the sushi truck, strays by the gate
  {
    name: 'cones-1',
    url: '/models/district/cone.glb',
    x: -4.9,
    y: 0,
    z: -5.9,
    size: 0.85,
    byHeight: true,
    tint: 1.05,
    cluster: [{ dx: 0, dz: 0 }, { dx: 0.5, dz: -0.7 }, { dx: -0.35, dz: -1.2 }],
  },
  {
    name: 'cones-2',
    url: '/models/district/cone.glb',
    x: 4.85,
    y: 0,
    z: -7.5,
    size: 0.85,
    byHeight: true,
    tint: 1.05,
    cluster: [{ dx: 0, dz: 0 }, { dx: 0.5, dz: -0.8 }],
  },
  {
    name: 'cones-3',
    url: '/models/district/cone.glb',
    x: 4.9,
    y: 0,
    z: -18.2,
    size: 0.85,
    byHeight: true,
    tint: 1.05,
    cluster: [{ dx: -0.2, dz: 0 }, { dx: 0.45, dz: -0.9 }, { dx: -0.1, dz: -1.8 }],
  },

  // hanging neon sign clusters — the shopfront collage
  {
    name: 'neon-signs-1',
    url: '/models/district/neon-signs.glb',
    x: 6.5,
    y: 3.5,
    z: -27.4,
    size: 3.0,
    yaw: -0.35,
    tint: 1.15,
    bob: 0.1,
    phase: 0.8,
  },
  {
    name: 'neon-signs-2',
    url: '/models/district/neon-signs.glb',
    x: -6.6,
    y: 3.1,
    z: -13.6,
    size: 2.8,
    yaw: 0.42,
    tint: 1.15,
    bob: 0.12,
    phase: 2.2,
  },

  // giant shuriken signage — one spins over the bar row, one over links
  { name: 'shuriken-1', url: '/models/district/shuriken.glb', x: 6.55, y: 4.7, z: -10.4, size: 2.3, tint: 1.2, spin: 0.55 },
  { name: 'shuriken-2', url: '/models/district/shuriken-b.glb', x: -6.6, y: 4.3, z: -33.9, size: 1.9, tint: 1.15, spin: -0.45 },

  // the one that rides the camera between stations
  { name: 'shuriken-fly', url: '/models/district/shuriken-b.glb', x: 0, y: 0, z: 0, size: 0.95, tint: 1, flat: '#e6f7ff', fly: true },

  // the big building block anchoring the skyline at street level
  {
    name: 'bar',
    url: '/models/district/bar.glb',
    x: 0,
    y: 0,
    z: -51.5,
    size: 11.5,
    yaw: 0,
    tint: 0.85,
    mirror: true,
  },
]

interface LiveProp {
  wrap: ThreeNS.Object3D
  def: PropDef
  baseY: number
  baseYaw: number
}

interface LiveInst {
  meshes: ThreeNS.InstancedMesh[]
  def: PropDef
  baseY: number
}

export async function attachDistrictProps(
  THREE: typeof ThreeNS,
  scene: ThreeNS.Scene,
  opts: {
    mirrorRoot?: ThreeNS.Group | null
    reduced?: boolean
    /** journey focus (station index as float) — drives the fly-by */
    focus?: () => number
    getCam?: () => ThreeNS.Camera | null
  } = {},
): Promise<PropHandle> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const { clone: skeletonClone } = await import('three/examples/jsm/utils/SkeletonUtils.js')
  const loader = new GLTFLoader()

  const live: LiveProp[] = []
  const instanced: LiveInst[] = []
  const flyers: LiveProp[] = []
  const mixers: ThreeNS.AnimationMixer[] = []
  const materials: ThreeNS.Material[] = []
  const geometries = new Set<ThreeNS.BufferGeometry>()
  const cables: ThreeNS.Object3D[] = []
  const instTwins: ThreeNS.InstancedMesh[] = []
  let placed = 0

  // one fetch per url — a dozen lamps are still one download
  const cache = new Map<string, Promise<{ scene: ThreeNS.Group; animations: ThreeNS.AnimationClip[] }>>()
  const load = (url: string) => {
    let hit = cache.get(url)
    if (!hit) {
      hit = loader.loadAsync(url).then(g => ({ scene: g.scene, animations: g.animations ?? [] }))
      cache.set(url, hit)
    }
    return hit
  }

  const unlit = (root: ThreeNS.Object3D, tintVal: number) => {
    const swap = new Map<ThreeNS.Material, ThreeNS.Material>()
    root.traverse((o) => {
      const mesh = o as ThreeNS.Mesh
      if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return
      const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as ThreeNS.MeshStandardMaterial
      if (!src) return
      let mat = swap.get(src)
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({
          map: src.map ?? null,
          color: (src.color ? src.color.clone() : new THREE.Color(0xffffff)).multiplyScalar(tintVal),
          vertexColors: src.vertexColors === true,
          side: src.side,
          transparent: src.transparent === true,
          alphaTest: src.alphaTest ?? 0,
        })
        swap.set(src, mat)
        materials.push(mat)
      }
      mesh.material = mat
    })
  }

  const dimmed = (mat: ThreeNS.Material) => {
    const dim = mat.clone()
    if ('color' in dim) (dim as ThreeNS.MeshBasicMaterial).color.multiplyScalar(0.45)
    materials.push(dim)
    return dim
  }

  const jobs = DISTRICT_PROPS.filter(def => !(def.heavy && opts.reduced)).map(async (def) => {
    const gltf = await load(def.url)
    const root = skeletonClone(gltf.scene)
    const tint = def.tint ?? 1
    unlit(root, tint)

    // normalise: any source units → target world size, bottom-centre pivot
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const dim = box.getSize(new THREE.Vector3())
    const ref = def.byHeight ? dim.y : dim.x
    root.scale.setScalar(def.size / Math.max(ref, 1e-3))
    root.updateMatrixWorld(true)
    const box2 = new THREE.Box3().setFromObject(root)
    const center = box2.getCenter(new THREE.Vector3())
    root.position.set(-center.x, -box2.min.y, -center.z)

    // some props are signage, not sculpture — a flat bright silhouette reads
    // from across the street where a dark metal mesh would vanish
    if (def.flat) {
      const flatMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(def.flat).multiplyScalar(tint),
        transparent: true,
        alphaTest: 0.02,
      })
      materials.push(flatMat)
      root.traverse((o) => {
        const mesh = o as ThreeNS.Mesh
        if ((mesh as unknown as { isMesh?: boolean }).isMesh) mesh.material = flatMat
      })
    }

    if (def.cluster?.length) {
      // instanced copies — one draw call per source mesh, however long the street
      root.updateMatrixWorld(true)
      const parts: Array<{ geo: ThreeNS.BufferGeometry; mat: ThreeNS.Material; m: ThreeNS.Matrix4 }> = []
      root.traverse((o) => {
        const mesh = o as ThreeNS.Mesh
        if (!(mesh as unknown as { isMesh?: boolean }).isMesh || (o as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) return
        o.updateWorldMatrix(true, false)
        parts.push({
          geo: mesh.geometry as ThreeNS.BufferGeometry,
          mat: (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as ThreeNS.Material,
          m: o.matrixWorld.clone(),
        })
        geometries.add(mesh.geometry as ThreeNS.BufferGeometry)
      })
      const n = def.cluster.length
      const ims: ThreeNS.InstancedMesh[] = []
      const scratch = new THREE.Matrix4()
      const inst = new THREE.Matrix4()
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, n)
        def.cluster.forEach((c, i) => {
          inst.makeRotationY((def.yaw ?? 0) + (c.yaw ?? 0))
          const s = c.scale ?? 1
          if (s !== 1) inst.multiply(scratch.makeScale(s, s, s))
          inst.setPosition(def.x + c.dx, def.y + (c.dy ?? 0), def.z + c.dz)
          scratch.multiplyMatrices(inst, part.m)
          im.setMatrixAt(i, scratch)
        })
        im.instanceMatrix.needsUpdate = true
        im.frustumCulled = false
        scene.add(im)
        ims.push(im)
        placed += 1
        if (def.mirror && opts.mirrorRoot) {
          const twin = new THREE.InstancedMesh(part.geo, dimmed(part.mat), n)
          twin.instanceMatrix = im.instanceMatrix
          twin.frustumCulled = false
          opts.mirrorRoot.add(twin)
          instTwins.push(twin)
          placed += 1
        }
      }
      instanced.push({ meshes: ims, def, baseY: def.y })
      return
    }

    const wrap = new THREE.Group()
    wrap.add(root)
    wrap.position.set(def.x, def.y, def.z)
    wrap.rotation.y = def.yaw ?? 0
    wrap.rotation.x = def.pitch ?? 0
    if (def.fly) {
      wrap.visible = false
      scene.add(wrap)
      flyers.push({ wrap, def, baseY: def.y, baseYaw: def.yaw ?? 0 })
    } else {
      scene.add(wrap)
      live.push({ wrap, def, baseY: def.y, baseYaw: wrap.rotation.y })
      placed += 1
    }

    // idle animation — one loop clip is plenty for a district full of signs
    if (gltf.animations.length && !def.fly) {
      const want = (def.anim ?? 'Idle').toLowerCase()
      const clip = gltf.animations.find((c) => (c.name.split('|').pop() ?? '').trim().toLowerCase() === want) ?? gltf.animations[0]
      const mixer = new THREE.AnimationMixer(root)
      mixer.clipAction(clip).play()
      mixers.push(mixer)
    }

    // wet-street twin (static props only) — darkened so the reflection reads
    // like a wet street instead of a second city
    if (def.mirror && opts.mirrorRoot && !def.fly) {
      const twin = wrap.clone(true)
      twin.traverse((o) => {
        const mesh = o as ThreeNS.Mesh
        if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return
        const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as ThreeNS.Material
        if (!mat) return
        mesh.material = dimmed(mat)
      })
      opts.mirrorRoot.add(twin)
      placed += 1
    }
  })

  // chochin cables — a thin dark line the lantern strings hang from
  {
    const cableGeo = new THREE.BoxGeometry(8.6, 0.03, 0.03)
    const cableMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#0a0e18') })
    geometries.add(cableGeo)
    materials.push(cableMat)
    for (const z of [-8.2, -20.6, -31.5, -43.0]) {
      const cable = new THREE.Mesh(cableGeo, cableMat)
      cable.position.set(0, 3.62, z)
      scene.add(cable)
      cables.push(cable)
      if (opts.mirrorRoot && !opts.reduced) {
        const twin = new THREE.Mesh(cableGeo, dimmed(cableMat))
        twin.position.copy(cable.position)
        opts.mirrorRoot.add(twin)
        cables.push(twin)
      }
    }
  }

  await Promise.allSettled(jobs)

  return {
    count: () => placed,
    flyer() {
      const p = flyers[0]
      if (!p) return null
      const wp = new THREE.Vector3()
      p.wrap.getWorldPosition(wp)
      return {
        visible: p.wrap.visible,
        x: Number(wp.x.toFixed(2)),
        y: Number(wp.y.toFixed(2)),
        z: Number(wp.z.toFixed(2)),
      }
    },
    update(clock, dt) {
      if (opts.reduced) return
      for (const m of mixers) m.update(dt)

      for (const p of live) {
        const phase = p.def.phase ?? 0
        if (p.def.bob) p.wrap.position.y = p.baseY + Math.sin(clock * 1.05 + phase) * p.def.bob
        if (p.def.spin) {
          p.wrap.rotation.y = p.baseYaw + clock * p.def.spin
        } else if (p.def.sway) {
          p.wrap.rotation.y = p.baseYaw + Math.sin(clock * 0.32 + phase) * p.def.sway
        }
      }

      for (const p of instanced) {
        const phase = p.def.phase ?? 0
        if (p.def.bob) {
          const y = p.baseY + Math.sin(clock * 1.05 + phase) * p.def.bob
          for (const im of p.meshes) im.position.y = y
        }
      }

      // the ninja star that crosses the walk between stations
      const cam = opts.getCam?.()
      const f = opts.focus?.() ?? 0
      const frac = f - Math.round(f)
      const a = Math.abs(frac)
      const show = !!cam && a > 0.16 && a < 0.499
      for (const p of flyers) {
        if (!show || !cam) {
          p.wrap.visible = false
          continue
        }
        p.wrap.visible = true
        const u = frac + 0.5
        p.wrap.position.set(
          -4.6 + u * 9.2,
          0.35 + Math.sin(u * Math.PI) * 1.05,
          -3.6,
        )
        p.wrap.position.applyQuaternion(cam.quaternion).add(cam.position)
        p.wrap.quaternion.copy(cam.quaternion)
        p.wrap.rotateZ(clock * 7.5)
        p.wrap.rotateY(Math.sin(u * Math.PI) * 0.5)
      }
    },
    dispose() {
      for (const p of live) p.wrap.parent?.remove(p.wrap)
      for (const p of flyers) p.wrap.parent?.remove(p.wrap)
      for (const c of cables) c.parent?.remove(c)
      for (const p of instanced) {
        for (const im of p.meshes) im.parent?.remove(im)
      }
      for (const twin of instTwins) twin.parent?.remove(twin)
      for (const m of mixers) m.stopAllAction()
      for (const m of materials) m.dispose()
      for (const g of geometries) g.dispose()
      live.length = 0
      instanced.length = 0
      flyers.length = 0
      cables.length = 0
      instTwins.length = 0
      mixers.length = 0
      materials.length = 0
      geometries.clear()
    },
  }
}
