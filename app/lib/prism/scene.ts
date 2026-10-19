// PRISM — the scene behind a profile.
// A point cloud assembles itself into the display name during the entrance,
// a grid floor and orbiting social glyphs settle around it, and the whole
// frame is finished with a 15-bit dithered pass. Kept light on purpose: one
// draw call per layer, adaptive quality tiers, pause when the tab is hidden.

import type * as ThreeNS from 'three'
import type { Profile } from '~/types/profile'
import { emitSpawn, onSpawn } from '../bus'
import { ATLAS_COLS, ATLAS_ROWS, buildIconAtlas } from '../iconAtlas'
import { sampleTextPoints } from './textPoints'
import { buildPanelAtlas } from './panelAtlas'
import { attachDistrictProps, type PropHandle } from './props'
import { buildStations, createJourney, type JourneyHandle, type Station } from './journey'
import {
  BG_FRAG,
  GLYPH_FRAG,
  GLYPH_VERT,
  GRID_FRAG,
  GRID_VERT,
  MOTE_FRAG,
  MOTE_VERT,
  ORB_FRAG,
  ORB_VERT,
  PANEL_FRAG,
  PANEL_VERT,
  POINTS_FRAG,
  POINTS_VERT,
  POST_FRAG,
  QUAD_VERT,
  SOLID_FRAG,
  SOLID_VERT,
  TOWER_FRAG,
  TOWER_VERT,
} from './shaders'

interface PanelMeta {
  id: number
  x: number
  y: number
  z: number
  w: number
  h: number
  /** journey station this board belongs to (focus dimming + click gating) */
  station: number
  url?: string
}

export interface PrismSceneOptions {
  canvas: HTMLCanvasElement
  profile: Profile
  reduced?: boolean
  quick?: boolean
}

export interface PrismSceneHandle {
  start(): Promise<void>
  destroy(): void
}

const FOV = 55
const NAME_Y = 1.45

// Entrance timeline marks, seconds (multiplied by timeScale at runtime).
const M_BOOT = 1.05
const M_FORM = 2.3
const M_LAND = 1.25

const TIERS = [
  { dpr: 2, scale: 0.72, fx: true },
  { dpr: 1.5, scale: 0.6, fx: true },
  { dpr: 1.25, scale: 0.5, fx: false },
]

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const clamp01 = (v: number) => clamp(v, 0, 1)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)

interface GlyphMeta {
  url: string
  platform: string
  radius: number
  speed: number
  phase: number
  y: number
}

export function createPrismScene(opts: PrismSceneOptions): PrismSceneHandle {
  const { canvas, profile } = opts
  const reduced = Boolean(opts.reduced)
  const quick = Boolean(opts.quick)

  const timeScale = (quick ? 0.55 : 1) * (reduced ? 0.75 : 1)
  const BOOT_END = M_BOOT * timeScale
  const FORM_END = BOOT_END + M_FORM * timeScale
  const LAND_END = FORM_END + M_LAND * timeScale
  const startSeq = quick ? BOOT_END + (FORM_END - BOOT_END) * 0.45 : 0

  let disposed = false
  let stopped = false
  let running = false
  let started = false
  let revealed = false
  let raf = 0
  let offBus: (() => void) | null = null

  // timeline state
  let seq = 0
  let clock = 0
  let formT = 0
  let landT = 0
  let gridOp = 0
  let bgScan = 1.35
  let flash = 0
  let glitch = 0
  let waveR = 42
  let waveOn = false
  let formStarted = false
  let formDone = false
  let landStarted = false
  let nextGlitch = 7 + Math.random() * 6

  // companion drone hover anchor (world space; x refined at build time)
  const hover = { x: 3.2, y: 1.62, z: 1.35 }

  // pointer
  const ptr = { x: 0, y: 0 }
  const ptrT = { x: 0, y: 0 }
  let hoverIdx = -1
  let hoverStr = 0
  let cursorOn = false

  // explore controls — drag to look around a station, wheel/pinch to zoom
  const orbit = { yaw: 0, pitch: 0, zoom: 0 }
  const orbitT = { yaw: 0, pitch: 0, zoom: 0 }
  const pinch = new Map<number, { x: number; y: number }>()
  let dragId: number | null = null
  let dragMoved = 0
  let dragDownAt = 0
  let lastPointerX = 0
  let lastPointerY = 0
  let pinchDist = 0
  let exploreAt = -10
  const panelMeta: PanelMeta[] = []
  let panelHover = -1
  let lastOpenUrl = ''

  // the journey — scroll walks the camera down the street
  const stations: Station[] = buildStations(profile)
  let journey: JourneyHandle | null = null
  let segCurves: ThreeNS.CatmullRomCurve3[] = []
  let camP: ThreeNS.Vector3 | null = null
  let camL: ThreeNS.Vector3 | null = null
  let offStation: (() => void) | null = null

  // quality
  let tier = 0
  let qAcc = 0
  let qFrames = 0
  let slowWindows = 0

  // webgl handles
  let T: typeof ThreeNS | null = null
  let renderer: ThreeNS.WebGLRenderer | null = null
  let rt: ThreeNS.WebGLRenderTarget | null = null
  let scene: ThreeNS.Scene | null = null
  let bgScene: ThreeNS.Scene | null = null
  let postScene: ThreeNS.Scene | null = null
  let cam: ThreeNS.PerspectiveCamera | null = null
  let quadCam: ThreeNS.OrthographicCamera | null = null
  let bgMat: ThreeNS.ShaderMaterial | null = null
  let gridMat: ThreeNS.ShaderMaterial | null = null
  let pointsMat: ThreeNS.ShaderMaterial | null = null
  let motesMat: ThreeNS.ShaderMaterial | null = null
  let glyphMat: ThreeNS.ShaderMaterial | null = null
  let postMat: ThreeNS.ShaderMaterial | null = null
  let towerMat: ThreeNS.ShaderMaterial | null = null
  let panelMat: ThreeNS.ShaderMaterial | null = null
  let orbMat: ThreeNS.ShaderMaterial | null = null
  let bodyMat: ThreeNS.ShaderMaterial | null = null
  let ringMat: ThreeNS.ShaderMaterial | null = null
  let eyeMat: ThreeNS.ShaderMaterial | null = null
  let drone: ThreeNS.Group | null = null
  let ringPivot: ThreeNS.Object3D | null = null
  let nameCloud: ThreeNS.Points | null = null
  let nameMirror: ThreeNS.Points | null = null
  let mirrorRoot: ThreeNS.Group | null = null
  let propHandle: PropHandle | null = null
  let vec: ThreeNS.Vector3 | null = null
  let disposables: Array<{ dispose(): void }> = []
  const glyphMeta: GlyphMeta[] = []
  let cssW = 1
  let cssH = 1

  /* ------------------------------- helpers ------------------------------- */

  function safeColor(value: string | undefined, fallback: string): ThreeNS.Color {
    try {
      return new T!.Color(value || fallback)
    } catch {
      return new T!.Color(fallback)
    }
  }

  function applySize() {
    if (!renderer || !cam || !rt || !T) return
    const rect = canvas.getBoundingClientRect()
    cssW = Math.max(2, rect.width)
    cssH = Math.max(2, rect.height)
    const aspect = cssW / cssH
    const dprEff = Math.min(window.devicePixelRatio || 1, TIERS[tier].dpr)

    renderer.setPixelRatio(dprEff)
    renderer.setSize(cssW, cssH, false)
    cam.aspect = aspect
    cam.updateProjectionMatrix()

    rt.setSize(
      Math.max(2, Math.round(cssW * dprEff * TIERS[tier].scale)),
      Math.max(2, Math.round(cssH * dprEff * TIERS[tier].scale)),
    )
  }

  function emitProgress(v: number, label: string) {
    emitSpawn({ type: 'progress', v, label })
  }

  function reveal() {
    if (revealed) return
    revealed = true
    emitProgress(1, 'READY')
    emitSpawn({ type: 'phase', phase: 'live', label: 'ลิงก์พร้อม' })
    emitSpawn({ type: 'reveal' })
    console.info('[prism] live')
  }

  function stopLoop() {
    running = false
    cancelAnimationFrame(raf)
  }

  function fallbackStatic() {
    stopped = true
    stopLoop()
    document.documentElement.classList.remove('has-gl')
    document.documentElement.classList.remove('is-exploring')
    try {
      canvas.style.opacity = '0'
    } catch {
      // noop
    }
    reveal()
  }

  function skipToLand() {
    if (disposed || revealed) return
    seq = Math.max(seq, LAND_END - 0.35)
  }

  /* ------------------------------- hit test ------------------------------ */

  function hitTest(nx: number, ny: number): number {
    if (!cam || !T || !vec || revealed === false || glyphMeta.length === 0) return -1
    let best = -1
    let bestD = 0.13
    for (let i = 0; i < glyphMeta.length; i++) {
      const m = glyphMeta[i]
      const ang = clock * m.speed + m.phase
      vec.set(
        Math.cos(ang) * m.radius,
        m.y + Math.sin(clock * 0.7 + m.phase) * 0.22,
        Math.sin(ang) * m.radius - 2.2,
      )
      vec.project(cam)
      if (vec.z > 1) continue
      const d = Math.hypot(vec.x - nx, vec.y - ny)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  /* -------------------------------- build -------------------------------- */

  async function build() {
    const THREE = T!

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    })
    renderer.setClearColor(0x04060b, 1)
    renderer.autoClear = false
    disposables.push(renderer)

    cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 90)
    cam.position.set(0, 2.5, 6.6)
    cam.lookAt(0, 1.15, 0)
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    vec = new THREE.Vector3()
    camP = new THREE.Vector3()
    camL = new THREE.Vector3()

    // flight paths between stations — each hop bows sideways so the ride
    // reads like a drive, not a dolly. the last hop lifts over the venue
    // (the bar model) so the camera never clips through it.
    segCurves = []
    for (let k = 0; k < stations.length - 1; k++) {
      const a = new THREE.Vector3(...stations[k].cam)
      const b = new THREE.Vector3(...stations[k + 1].cam)
      const mid = a.clone().lerp(b, 0.5)
      const last = k === stations.length - 2
      mid.x += (k % 2 === 0 ? 1 : -1) * 1.25
      mid.y += last ? 4.6 : 0.4
      segCurves.push(new THREE.CatmullRomCurve3([a, mid, b], false, 'catmullrom', 0.5))
    }

    // the panel atlas draws while the name cloud is sampled (parallel work)
    const atlasPromise = buildPanelAtlas(THREE, profile)

    const colA = safeColor(profile.theme?.primary, '#cfe6ff')
    const colB = safeColor(profile.theme?.accent, '#ffb65c')
    const voidA = new THREE.Color('#04060b')
    const voidB = colA.clone().multiplyScalar(0.10)

    /* background */
    bgScene = new THREE.Scene()
    bgMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BG_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uScan: { value: bgScan },
        uVoidA: { value: voidA },
        uVoidB: { value: voidB },
        uGlow: { value: colA.clone().multiplyScalar(0.55) },
        uFlash: { value: 0 },
        uRes: { value: new THREE.Vector2(cssW, cssH) },
      },
    })
    const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat)
    bgQuad.frustumCulled = false
    bgScene.add(bgQuad)
    disposables.push(bgMat, bgQuad.geometry)

    /* main scene */
    scene = new THREE.Scene()
    const reflectables: ThreeNS.Object3D[] = []

    gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWave: { value: 42 },
        uOpacity: { value: 0 },
        uColor: { value: colA.clone() },
        uAccent: { value: colB.clone() },
      },
    })
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), gridMat)
    grid.rotation.x = -Math.PI / 2
    grid.renderOrder = 0
    grid.frustumCulled = false
    scene.add(grid)
    disposables.push(gridMat, grid.geometry)

    /* the neon district — layout anchors */
    const rect0 = canvas.getBoundingClientRect()
    const aspect0 = Math.max(rect0.width, 1) / Math.max(rect0.height, 1)
    const portrait0 = aspect0 < 0.9
    const sideScale0 = clamp(aspect0 / 1.6, 0.45, 1)
    const spread = 0.3 + 0.7 * sideScale0
    // phones hold far less width — pull the signage into the tall frame
    const xMul = portrait0 ? 0.62 : 1
    const boardK = portrait0 ? 0.62 : clamp(aspect0 / 1.2, 0.72, 1)
    hover.x = clamp(3.27 * aspect0, 1.5, 5.6)

    /* skyline: one merged mesh of dark towers with lit windows */
    {
      const positions: number[] = []
      const uvs: number[] = []
      const seeds: number[] = []
      const neons: number[] = []
      const segs: number[] = []
      const indices: number[] = []
      let vOff = 0
      const pushTower = (x: number, z: number, w: number, h: number, d: number) => {
        const g = new THREE.BoxGeometry(w, h, d)
        g.translate(x, h / 2 - 0.4, z)
        const pos = g.attributes.position
        const uv = g.attributes.uv
        const seed = Math.random()
        const neon = Math.random()
        const segX = Math.max(3, w * 1.6)
        const segY = Math.max(4, h * 1.4)
        for (let i = 0; i < pos.count; i++) {
          positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
          uvs.push(uv.getX(i), uv.getY(i))
          seeds.push(seed)
          neons.push(neon)
          segs.push(segX, segY)
        }
        const idx = g.index!
        for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + vOff)
        vOff += pos.count
        g.dispose()
      }
      // near canyon — towers lining the whole street, filling the frame
      for (let i = 0; i < 24; i++) {
        const side = i % 2 === 0 ? 1 : -1
        pushTower(
          side * (6.0 + Math.random() * 3.4) * spread,
          -6 - (i / 23) * 66 - Math.random() * 3,
          1.6 + Math.random() * 1.6,
          5.5 + Math.random() * 8.5,
          1.6 + Math.random() * 1.6,
        )
      }
      for (let i = 0; i < 16; i++) {
        const side = i % 2 === 0 ? 1 : -1
        pushTower(
          side * (7 + Math.random() * 10) * spread,
          -30 - (i / 15) * 44 - Math.random() * 6,
          1.4 + Math.random() * 2.4,
          3 + Math.random() * 9,
          1.4 + Math.random() * 2.4,
        )
      }
      for (let i = 0; i < 14; i++) {
        const side = i % 2 === 0 ? 1 : -1
        pushTower(
          side * (6.5 + Math.random() * 13) * spread,
          -54 - Math.random() * 34,
          1.6 + Math.random() * 3,
          4 + Math.random() * 12,
          1.6 + Math.random() * 3,
        )
      }
      const towerGeo = new THREE.BufferGeometry()
      towerGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      towerGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      towerGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
      towerGeo.setAttribute('aNeon', new THREE.Float32BufferAttribute(neons, 1))
      towerGeo.setAttribute('aSeg', new THREE.Float32BufferAttribute(segs, 2))
      towerGeo.setIndex(indices)
      towerMat = new THREE.ShaderMaterial({
        vertexShader: TOWER_VERT,
        fragmentShader: TOWER_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uLit: { value: 0.15 },
          uColA: { value: colA.clone().multiplyScalar(0.75) },
          uColB: { value: colB.clone() },
          uVoid: { value: new THREE.Color('#0b1220') },
          uFog: { value: voidB.clone().multiplyScalar(0.55) },
        },
      })
      const towers = new THREE.Mesh(towerGeo, towerMat)
      towers.renderOrder = -2
      towers.frustumCulled = false
      scene.add(towers)
      disposables.push(towerMat, towerGeo)
      reflectables.push(towers)
    }

    /* neon sky wash — coloured haze burning behind the skyline */
    {
      const glowCanvas = (rgb: string) => {
        const c2 = document.createElement('canvas')
        c2.width = 256
        c2.height = 128
        const g = c2.getContext('2d')!
        const grad = g.createRadialGradient(128, 128, 8, 128, 128, 152)
        grad.addColorStop(0, `rgba(${rgb},0.9)`)
        grad.addColorStop(0.45, `rgba(${rgb},0.22)`)
        grad.addColorStop(1, `rgba(${rgb},0)`)
        g.fillStyle = grad
        g.fillRect(0, 0, 256, 128)
        const t = new THREE.CanvasTexture(c2)
        t.colorSpace = THREE.SRGBColorSpace
        return t
      }
      const glows: Array<[string, number, number, number, number, number]> = [
        ['255,47,109', 0, 3.6, -36, 84, 26],
        ['56,232,255', -14, 2.6, -30, 46, 15],
        ['180,92,255', 13, 3.1, -33, 42, 14],
        ['255,47,109', -4, 3.4, -62, 62, 20],
        ['56,232,255', 6, 2.9, -72, 54, 17],
      ]
      for (const [rgb, gx, gy, gz, gw, gh] of glows) {
        const tex = glowCanvas(rgb)
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
        const q = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), mat)
        q.position.set(gx, gy, gz)
        q.renderOrder = -3
        q.frustumCulled = false
        scene.add(q)
        disposables.push(tex, mat, q.geometry)
      }
    }

    /* social glyph chips */
    const socials = (profile.socials ?? []).filter(s => s && s.url).slice(0, 8)
    if (socials.length > 0) {
      const atlas = buildIconAtlas(THREE)
      disposables.push(atlas.texture)

      const rect = canvas.getBoundingClientRect()
      const meshScale = clamp(Math.max(rect.width, 1) / Math.max(rect.height, 1) / 1.6, 0.45, 1)
      const n = socials.length
      const verts = n * 6
      const CORNERS: Array<[number, number]> = [
        [-1, -1], [1, -1], [1, 1],
        [-1, -1], [1, 1], [-1, 1],
      ]
      const position = new Float32Array(verts * 3)
      const aCorner = new Float32Array(verts * 2)
      const aIconUv = new Float32Array(verts * 2)
      const aIndex = new Float32Array(verts)
      const aRadius = new Float32Array(verts)
      const aSpeed = new Float32Array(verts)
      const aPhase = new Float32Array(verts)
      const aY = new Float32Array(verts)

      socials.forEach((s, i) => {
        const cellIndex = atlas.index(s.platform)
        const col = cellIndex % ATLAS_COLS
        const rowFromBottom = Math.floor(cellIndex / ATLAS_COLS)
        const iconUv: [number, number] = [col / ATLAS_COLS, rowFromBottom / ATLAS_ROWS]
        const radius = (3.4 + (i % 3) * 0.8) * meshScale
        const dir = i % 2 === 0 ? 1 : -1
        const speed = dir * (0.12 + (i % 4) * 0.05)
        const phase = (i / n) * Math.PI * 2 + 0.5
        const y = 0.5 + ((i * 37) % 5) * 0.3
        glyphMeta.push({ url: s.url, platform: s.platform, radius, speed, phase, y })

        for (let v = 0; v < 6; v++) {
          const o = i * 6 + v
          aCorner[o * 2] = CORNERS[v][0]
          aCorner[o * 2 + 1] = CORNERS[v][1]
          aIconUv[o * 2] = iconUv[0]
          aIconUv[o * 2 + 1] = iconUv[1]
          aIndex[o] = i
          aRadius[o] = radius
          aSpeed[o] = speed
          aPhase[o] = phase
          aY[o] = y
        }
      })

      const glyphGeo = new THREE.BufferGeometry()
      glyphGeo.setAttribute('position', new THREE.BufferAttribute(position, 3))
      glyphGeo.setAttribute('aCorner', new THREE.BufferAttribute(aCorner, 2))
      glyphGeo.setAttribute('aIconUv', new THREE.BufferAttribute(aIconUv, 2))
      glyphGeo.setAttribute('aIndex', new THREE.BufferAttribute(aIndex, 1))
      glyphGeo.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1))
      glyphGeo.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1))
      glyphGeo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1))
      glyphGeo.setAttribute('aY', new THREE.BufferAttribute(aY, 1))

      glyphMat = new THREE.ShaderMaterial({
        vertexShader: GLYPH_VERT,
        fragmentShader: GLYPH_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uLand: { value: 0 },
          uHoverIdx: { value: -1 },
          uHoverStr: { value: 0 },
          uSize: { value: 0.44 + meshScale * 0.34 },
          uCell: { value: new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS) },
          uAtlas: { value: atlas.texture },
          uColor: { value: colA.clone() },
        },
      })
      const glyphMesh = new THREE.Mesh(glyphGeo, glyphMat)
      glyphMesh.renderOrder = 1
      glyphMesh.frustumCulled = false
      scene.add(glyphMesh)
      disposables.push(glyphMat, glyphGeo)
      reflectables.push(glyphMesh)
    }

    /* the name point cloud */
    const sample = await sampleTextPoints(profile.displayName)
    if (disposed) return
    const count = sample.positions.length / 3
    console.info('[prism] name points', { points: count, fallback: sample.fallback })
    const rushPos = new Float32Array(count * 3)
    const aDelay = new Float32Array(count)
    const aSeed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      rushPos[i * 3] = (Math.random() - 0.5) * 30
      rushPos[i * 3 + 1] = -4 + Math.random() * 13
      rushPos[i * 3 + 2] = -32 + Math.random() * 26
      aDelay[i] = Math.random()
      aSeed[i] = Math.random()
    }
    const pointsGeo = new THREE.BufferGeometry()
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(rushPos, 3))
    pointsGeo.setAttribute('aTarget', new THREE.BufferAttribute(sample.positions, 3))
    pointsGeo.setAttribute('aDelay', new THREE.BufferAttribute(aDelay, 1))
    pointsGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1))

    pointsMat = new THREE.ShaderMaterial({
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFormT: { value: 0 },
        uSize: { value: reduced ? 1 : 1.15 },
        uDrift: { value: reduced ? 0.03 : 0.06 },
        uGlitch: { value: 0 },
        uFlash: { value: 0 },
        uSwirl: { value: reduced ? 0 : 1.35 },
        uDim: { value: 1 },
        uColA: { value: colA.clone() },
        uColB: { value: colB.clone() },
      },
    })
    const cloud = new THREE.Points(pointsGeo, pointsMat)
    cloud.position.y = NAME_Y
    cloud.renderOrder = 2
    cloud.frustumCulled = false
    nameCloud = cloud
    reflectables.push(cloud)

    const rect2 = canvas.getBoundingClientRect()
    const nameScale = clamp(Math.max(rect2.width, 1) / Math.max(rect2.height, 1) / 1.6, 0.45, 1) * (portrait0 ? 0.62 : 1)
    cloud.scale.setScalar(nameScale)
    scene.add(cloud)
    disposables.push(pointsMat, pointsGeo)

    /* ambient motes */
    const moteCount = Math.round(clamp((profile.scene?.moteCount ?? 1800) * 0.6, 240, 2200))
    const motePos = new Float32Array(moteCount * 3)
    const moteSeed = new Float32Array(moteCount)
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = (Math.random() - 0.5) * 36
      motePos[i * 3 + 1] = -1 + Math.random() * 9
      motePos[i * 3 + 2] = 10 - Math.random() * 92
      moteSeed[i] = Math.random()
    }
    const moteGeo = new THREE.BufferGeometry()
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3))
    moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1))
    motesMat = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 1.4 },
        uColor: { value: colA.clone().multiplyScalar(0.7) },
      },
    })
    const motes = new THREE.Points(moteGeo, motesMat)
    motes.renderOrder = 3
    motes.frustumCulled = false
    scene.add(motes)
    disposables.push(motesMat, moteGeo)

    /* holo billboards — the profile's own data as floating signage */
    {
      const atlas = await atlasPromise
      if (disposed) {
        atlas.texture.dispose()
        return
      }
      disposables.push(atlas.texture)

      // which station each board belongs to (data-driven — absent stations
      // simply have no boards)
      const S: Partial<Record<Station['id'], number>> = {}
      stations.forEach((s, i) => {
        S[s.id] = i
      })
      const profileUrl = `${window.location.origin}/p/${profile.username}`
      const np = profile.nowPlaying
      const npUrl = np?.spotify || profileUrl

      type PlanEntry = { st: Station['id'], cell: number, x: number, y: number, z: number, yaw: number, pitch: number, w: number, h: number, url?: string }
      const plan: PlanEntry[] = [
        // — station: PROFILE — the gate. Handle card, name marquee, the id photo.
        { st: 'profile', cell: 0, x: -2.75, y: 2.4, z: -1.7, yaw: 0.16, pitch: -0.02, w: 5.0, h: 2.5 },
        { st: 'profile', cell: 1, x: 4.25, y: 3.95, z: -3.2, yaw: -0.2, pitch: -0.03, w: 5.2, h: 2.6 },
        // the profile photo — hero-sized, right of the name, impossible to miss
        { st: 'profile', cell: 7, x: 1.75, y: 1.9, z: -2.3, yaw: -0.1, pitch: 0.01, w: 2.9, h: 2.9 },
        { st: 'profile', cell: 13, x: -5.3, y: 2.3, z: -3.2, yaw: 0.34, pitch: -0.02, w: 1.05, h: 3.0 },
        { st: 'profile', cell: 14, x: 5.6, y: 1.5, z: -3.9, yaw: -0.36, pitch: 0.01, w: 2.8, h: 1.5 },
        // — station: INFO — the data wall you walk up to
        { st: 'info', cell: 3, x: -3.9, y: 2.9, z: -16.4, yaw: 0.26, pitch: -0.02, w: 3.6, h: 3.6 },
        { st: 'info', cell: 5, x: 4.1, y: 2.7, z: -17.4, yaw: -0.28, pitch: -0.02, w: 3.4, h: 3.4 },
        { st: 'info', cell: 15, x: -6.6, y: 5.0, z: -19.4, yaw: 0.42, pitch: -0.06, w: 4.2, h: 2.1 },
        { st: 'info', cell: 15, x: 6.8, y: 5.3, z: -20.2, yaw: -0.44, pitch: -0.06, w: 4.2, h: 2.1 },
        { st: 'info', cell: 14, x: 0.4, y: 4.9, z: -21.8, yaw: 0.02, pitch: -0.03, w: 3.0, h: 1.7 },
        // — station: LINKS — the avenue of doors (one board per link below) —
        { st: 'links', cell: 4, x: 0, y: 4.3, z: -33.4, yaw: 0, pitch: -0.04, w: 4.2, h: 4.2 },
        { st: 'links', cell: 6, x: 0, y: 1.7, z: -28.8, yaw: 0, pitch: 0.03, w: 3.0, h: 3.0, url: profileUrl },
        // — station: STAGE — the bar. Now playing + the spotify door.
        { st: 'stage', cell: 2, x: 0, y: 2.9, z: -45.6, yaw: 0, pitch: -0.02, w: 5.2, h: 5.2 },
        { st: 'stage', cell: 6, x: -4.6, y: 1.5, z: -43.4, yaw: 0.3, pitch: 0.02, w: 2.4, h: 2.4, url: npUrl },
        { st: 'stage', cell: 15, x: 4.7, y: 1.6, z: -43.9, yaw: -0.3, pitch: 0.02, w: 3.2, h: 3.2 },
        // — station: OUTRO — the exit gate past the venue. Share QR, name, connects.
        { st: 'outro', cell: 6, x: 0, y: 2.3, z: -65.4, yaw: 0, pitch: -0.02, w: 4.8, h: 4.8, url: profileUrl },
        { st: 'outro', cell: 1, x: -3.5, y: 2.5, z: -63.6, yaw: 0.3, pitch: -0.03, w: 4.0, h: 2.0 },
        { st: 'outro', cell: 5, x: 3.7, y: 2.5, z: -63.8, yaw: -0.3, pitch: -0.03, w: 3.6, h: 3.6 },
      ]

      // one board per link — every link is its own door down the avenue
      profile.links.slice(0, 4).forEach((l, li) => {
        const col = li % 2 === 0 ? -1 : 1
        const row = Math.floor(li / 2)
        plan.push({
          st: 'links',
          cell: 8 + li,
          x: col * (3.9 + row * 0.35),
          y: row === 0 ? 3.0 : 1.15,
          z: -30.4 - row * 1.6,
          yaw: -col * (0.26 + row * 0.05),
          pitch: -0.02,
          w: 3.6,
          h: 1.8,
          url: l.url,
        })
      })

      const positions: number[] = []
      const uvs: number[] = []
      const uvMin: number[] = []
      const uvMax: number[] = []
      const seeds: number[] = []
      const delays: number[] = []
      const fades: number[] = []
      const pids: number[] = []
      const stationAttr: number[] = []
      const indices: number[] = []
      const corners: Array<[number, number, number, number]> = [
        [-0.5, -0.5, 0, 0],
        [0.5, -0.5, 1, 0],
        [0.5, 0.5, 1, 1],
        [-0.5, 0.5, 0, 1],
      ]
      const mat4 = new THREE.Matrix4()
      const quat = new THREE.Quaternion()
      const scl = new THREE.Vector3()
      const ppos = new THREE.Vector3()
      const cvec = new THREE.Vector3()

      const entries = plan.filter(p => S[p.st] !== undefined)
      entries.forEach((p, i) => {
        const cell = atlas.cells[p.cell % atlas.cells.length]
        const seed = Math.random()
        const delay = clamp(i * 0.045 + seed * 0.22, 0, 0.72)
        quat.setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'))
        scl.set(p.w * boardK, p.h * boardK, 1)
        ppos.set(p.x * spread * xMul, p.y, p.z)
        mat4.compose(ppos, quat, scl)
        const base = positions.length / 3
        const stIdx = S[p.st] ?? 0
        for (const [cx, cy, us, vs] of corners) {
          cvec.set(cx, cy, 0).applyMatrix4(mat4)
          positions.push(cvec.x, cvec.y, cvec.z)
          uvs.push(
            cell.min[0] + (cell.max[0] - cell.min[0]) * us,
            cell.min[1] + (cell.max[1] - cell.min[1]) * vs,
          )
          uvMin.push(cell.min[0], cell.min[1])
          uvMax.push(cell.max[0], cell.max[1])
          seeds.push(seed)
          delays.push(delay)
          fades.push(1)
          pids.push(i)
          stationAttr.push(stIdx)
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
        panelMeta.push({ id: i, x: ppos.x, y: ppos.y, z: ppos.z, w: p.w, h: p.h, station: stIdx, url: p.url })
      })

      const panelGeo = new THREE.BufferGeometry()
      panelGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      panelGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      panelGeo.setAttribute('aUvMin', new THREE.Float32BufferAttribute(uvMin, 2))
      panelGeo.setAttribute('aUvMax', new THREE.Float32BufferAttribute(uvMax, 2))
      panelGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
      panelGeo.setAttribute('aDelay', new THREE.Float32BufferAttribute(delays, 1))
      panelGeo.setAttribute('aFade', new THREE.Float32BufferAttribute(fades, 1))
      panelGeo.setAttribute('aPid', new THREE.Float32BufferAttribute(pids, 1))
      panelGeo.setAttribute('aStation', new THREE.Float32BufferAttribute(stationAttr, 1))
      panelGeo.setIndex(indices)
      panelMat = new THREE.ShaderMaterial({
        vertexShader: PANEL_VERT,
        fragmentShader: PANEL_FRAG,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uForm: { value: 0 },
          uTex: { value: atlas.texture },
          uTint: { value: new THREE.Color(1.0, 1.0, 1.06) },
          uHoverId: { value: -1 },
          uFocus: { value: 0 },
        },
      })
      const panels = new THREE.Mesh(panelGeo, panelMat)
      panels.renderOrder = -1
      panels.frustumCulled = false
      scene.add(panels)
      disposables.push(panelMat, panelGeo)
      reflectables.push(panels)
    }

    /* hover markers — accent glow orbs drifting through the district */
    {
      const n = 26
      const opos = new Float32Array(n * 3)
      const osize = new Float32Array(n)
      const oseed = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? 1 : -1
        opos[i * 3] = side * (2.6 + Math.random() * 5.5) * spread
        opos[i * 3 + 1] = 0.8 + Math.random() * 5.2
        opos[i * 3 + 2] = 1.5 - Math.random() * 66
        osize[i] = 0.5 + Math.random() * 1.1
        oseed[i] = Math.random()
      }
      const orbGeo = new THREE.BufferGeometry()
      orbGeo.setAttribute('position', new THREE.BufferAttribute(opos, 3))
      orbGeo.setAttribute('aSize', new THREE.BufferAttribute(osize, 1))
      orbGeo.setAttribute('aSeed', new THREE.BufferAttribute(oseed, 1))
      orbMat = new THREE.ShaderMaterial({
        vertexShader: ORB_VERT,
        fragmentShader: ORB_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 1 },
          uBright: { value: 0.25 },
          uColA: { value: colA.clone() },
          uColB: { value: colB.clone() },
        },
      })
      const orbs = new THREE.Points(orbGeo, orbMat)
      orbs.renderOrder = 3
      orbs.frustumCulled = false
      scene.add(orbs)
      disposables.push(orbMat, orbGeo)
    }

    /* companion drone — hovers beside the slab, blinks, watches the pointer */
    {
      drone = new THREE.Group()
      bodyMat = new THREE.ShaderMaterial({
        vertexShader: SOLID_VERT,
        fragmentShader: SOLID_FRAG,
        uniforms: {
          uBase: { value: new THREE.Color('#26334d') },
          uRim: { value: colB.clone().multiplyScalar(0.95) },
          uTime: { value: 0 },
        },
      })
      ringMat = new THREE.ShaderMaterial({
        vertexShader: SOLID_VERT,
        fragmentShader: SOLID_FRAG,
        uniforms: {
          uBase: { value: colB.clone().multiplyScalar(0.7) },
          uRim: { value: colA.clone() },
          uTime: { value: 0 },
        },
      })
      eyeMat = new THREE.ShaderMaterial({
        vertexShader: ORB_VERT,
        fragmentShader: ORB_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 0.7 },
          uBright: { value: 1 },
          uColA: { value: colB.clone() },
          uColB: { value: colB.clone().lerp(new THREE.Color('#ffffff'), 0.5) },
        },
      })
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), bodyMat)
      const ringGeo = new THREE.TorusGeometry(0.5, 0.03, 6, 30)
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ringPivot = new THREE.Group()
      ringPivot.rotation.x = Math.PI / 2
      ringPivot.add(ring)
      const eyeGeo = new THREE.BufferGeometry()
      eyeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.01, 0.27]), 3))
      eyeGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([1]), 1))
      eyeGeo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([0.42]), 1))
      const eye = new THREE.Points(eyeGeo, eyeMat)
      eye.renderOrder = 4
      eye.frustumCulled = false
      drone.add(body, ringPivot, eye)
      drone.position.set(hover.x + 4.2, 3.8, 2.8)
      scene.add(drone)
      disposables.push(bodyMat, ringMat, eyeMat, body.geometry, ringGeo, eyeGeo)
    }

    /* wet-street reflection — the whole district mirrored under the floor */
    {
      const mirror = new THREE.Group()
      mirror.scale.set(1, -1, 1)
      mirrorRoot = mirror
      for (const src of reflectables) {
        const anySrc = src as unknown as { geometry: ThreeNS.BufferGeometry; material: ThreeNS.Material; isPoints?: boolean }
        const clone = anySrc.isPoints
          ? new THREE.Points(anySrc.geometry, anySrc.material)
          : new THREE.Mesh(anySrc.geometry, anySrc.material)
        clone.renderOrder = src.renderOrder - 0.6
        clone.frustumCulled = false
        mirror.add(clone)
        if (src === nameCloud) nameMirror = clone as ThreeNS.Points
      }
      scene.add(mirror)

      // dim the reflection like a wet street
      const dimMat = new THREE.MeshBasicMaterial({
        color: 0x04060b,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })
      const dimPlane = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), dimMat)
      dimPlane.rotation.x = -Math.PI / 2
      dimPlane.position.y = 0.02
      dimPlane.renderOrder = -1.5
      dimPlane.frustumCulled = false
      scene.add(dimPlane)
      disposables.push(dimMat, dimPlane.geometry)
    }

    /* post pipeline */
    rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, stencilBuffer: false })
    postMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex: { value: rt.texture },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uGlitch: { value: 0 },
        uVig: { value: reduced ? 0.38 : 0.5 },
      },
    })
    postScene = new THREE.Scene()
    const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat)
    postQuad.frustumCulled = false
    postScene.add(postQuad)
    disposables.push(rt, postMat, postQuad.geometry)

    applySize()
  }

  /* ------------------------------- timeline ------------------------------ */

  function updateTimeline(dt: number) {
    if (seq < BOOT_END) {
      const k = seq / BOOT_END
      bgScan = 1.35 - k * 1.7
      gridOp = k * 0.1
    } else if (seq < FORM_END) {
      if (!formStarted) {
        formStarted = true
        emitSpawn({ type: 'phase', phase: 'assemble', label: 'ประกอบสัญญาณ' })
        emitProgress(0.8, 'FORMING')
      }
      const k = clamp01((seq - BOOT_END) / (FORM_END - BOOT_END))
      formT = k
      bgScan = lerp(bgScan, -0.6, clamp01(dt * 3))
      gridOp = 0.1 + easeOut(k) * 0.5
    } else {
      formT = 1
      gridOp = Math.max(gridOp, 0.6)
      if (!formDone) {
        formDone = true
        if (!reduced) {
          flash = 0.5
          glitch = 0.75
          waveOn = true
          waveR = 0
        }
        emitProgress(0.95, 'LOCK')
      }
      if (seq < LAND_END) {
        if (!landStarted) {
          landStarted = true
          emitSpawn({ type: 'phase', phase: 'land', label: 'ลงหลัก' })
        }
        landT = easeOut((seq - FORM_END) / (LAND_END - FORM_END))
      } else {
        landT = 1
        reveal()
      }
    }

    flash *= Math.exp(-dt * 6)
    glitch *= Math.exp(-dt * 4)
    if (waveOn) {
      waveR += dt * 26
      if (waveR > 44) waveOn = false
    }
    if (revealed && !reduced) {
      nextGlitch -= dt
      if (nextGlitch <= 0) {
        glitch = Math.max(glitch, 0.45)
        nextGlitch = 9 + Math.random() * 7
      }
    }
  }

  function computePose(outP: ThreeNS.Vector3, outL: ThreeNS.Vector3) {
    const n = stations.length
    const f = clamp(journey ? journey.f() : 0, 0, Math.max(0, n - 1))
    let i0 = Math.floor(f)
    if (i0 > n - 2) i0 = Math.max(0, n - 2)
    const t = n > 1 ? clamp(f - i0, 0, 1) : 0
    const tt = t * t * (3 - 2 * t)

    const curve = segCurves[i0]
    if (curve) {
      curve.getPointAt(tt, outP)
    } else {
      outP.set(...stations[0].cam)
    }

    const l0 = stations[i0].look
    const l1 = stations[Math.min(i0 + 1, n - 1)].look
    outL.set(
      lerp(l0[0], l1[0], tt),
      lerp(l0[1], l1[1], tt),
      lerp(l0[2], l1[2], tt) - Math.sin(Math.PI * tt) * 0.9,
    )

    // a parked camera still breathes — scaled down while travelling
    const settled = 1 - clamp(Math.abs(f - Math.round(f)) * 2.2, 0, 1)
    if (!reduced && settled > 0) {
      outP.x += Math.sin(clock * 0.5) * 0.05 * settled
      outP.y += Math.sin(clock * 0.77 + 1.3) * 0.035 * settled
    }
  }

  function applyCamera() {
    if (!cam || !camP || !camL) return
    computePose(camP, camL)

    const camT = revealed ? 1 : landT

    // the overture flies from the gate to the first station
    const fromX = quick ? camP.x : 0
    const fromY = quick || reduced ? camP.y : 2.5
    const fromZ = quick ? camP.z : 6.6
    const lookFromY = quick || reduced ? camL.y : 1.2

    let px = lerp(fromX, camP.x, camT)
    let py = lerp(fromY, camP.y, camT)
    let pz = lerp(fromZ, camP.z, camT)
    // phones crop the sides hard — step back so the whole street fits the frame
    pz += clamp((0.9 - cam.aspect) * 4.6, 0, 3.0) * camT
    const lx = camL.x
    const ly = lerp(lookFromY, camL.y, camT)
    const lz = camL.z

    // explore — a look-around that walks itself home
    const yaw = orbit.yaw * camT
    const pitch = orbit.pitch * camT
    const zoom = 1 + orbit.zoom * camT
    if (yaw !== 0 || pitch !== 0 || zoom !== 1) {
      let ox = (px - lx) * zoom
      let oy = (py - ly) * zoom
      let oz = (pz - lz) * zoom
      const cy = Math.cos(yaw)
      const sy = Math.sin(yaw)
      const rx = ox * cy + oz * sy
      let rz = -ox * sy + oz * cy
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      const ry = oy * cp - rz * sp
      rz = oy * sp + rz * cp
      px = lx + rx
      py = ly + ry
      pz = lz + rz
    }

    const pxo = reduced ? ptr.x * 0.16 : ptr.x * 0.28
    const pyo = reduced ? ptr.y * 0.1 : ptr.y * 0.16

    cam.position.set(px + pxo, py + pyo, pz)
    cam.lookAt(lx, ly, lz)
  }

  function panelHitTest(nx: number, ny: number): number {
    if (!cam || !vec || !revealed || panelMeta.length === 0) return -1
    const focus = journey ? journey.f() : 0
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < panelMeta.length; i++) {
      const p = panelMeta[i]
      // only the station you are standing at is clickable
      if (Math.abs(p.station - focus) > 0.6) continue
      vec.set(p.x, p.y, p.z)
      vec.project(cam)
      if (vec.z > 1) continue
      const dist = Math.hypot(
        cam.position.x - p.x,
        cam.position.y - p.y,
        cam.position.z - p.z,
      )
      const rad = clamp((p.w * 0.5) / (0.52 * Math.max(dist, 1)) * 0.9, 0.05, 0.7)
      const d = Math.hypot(vec.x - nx, vec.y - ny)
      if (d < rad && d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  function markExplore() {
    exploreAt = clock
  }

  function updateHover() {
    if (!revealed || !cam) return
    const busy = dragId !== null
    const gilt = busy ? -1 : hitTest(ptrT.x, ptrT.y)
    if (gilt !== hoverIdx) hoverIdx = gilt
    hoverStr = lerp(hoverStr, hoverIdx >= 0 ? 1 : 0, 0.18)
    const ph = busy || hoverIdx >= 0 ? -1 : panelHitTest(ptrT.x, ptrT.y)
    if (ph !== panelHover) panelHover = ph
    if (panelMat && panelMat.uniforms.uHoverId.value !== panelHover) {
      panelMat.uniforms.uHoverId.value = panelHover
    }
    const wantCursor = !busy && (hoverIdx >= 0 || (panelHover >= 0 && !!panelMeta[panelHover]?.url))
    if (wantCursor !== cursorOn) {
      cursorOn = wantCursor
      canvas.style.cursor = wantCursor ? 'pointer' : ''
    }
  }

  function renderFrame() {
    if (!renderer || !scene || !cam || !quadCam || !bgScene || !postScene) return
    if (bgMat) {
      bgMat.uniforms.uScan.value = bgScan
      bgMat.uniforms.uFlash.value = flash * 0.8
      bgMat.uniforms.uRes.value.set(cssW, cssH)
    }
    if (gridMat) {
      gridMat.uniforms.uTime.value = clock
      gridMat.uniforms.uWave.value = waveOn ? waveR : 44
      gridMat.uniforms.uOpacity.value = gridOp
    }
    if (pointsMat) {
      pointsMat.uniforms.uTime.value = clock
      pointsMat.uniforms.uFormT.value = formT
      pointsMat.uniforms.uGlitch.value = glitch
      pointsMat.uniforms.uFlash.value = flash * 0.5
      const dimTarget = revealed ? 1 : 1
      const dim = pointsMat.uniforms.uDim.value as number
      pointsMat.uniforms.uDim.value = dim + (dimTarget - dim) * 0.04
    }
    if (motesMat) motesMat.uniforms.uTime.value = clock
    if (nameCloud) {
      nameCloud.position.y = NAME_Y + 1.9 * landT
      if (nameMirror) nameMirror.position.y = nameCloud.position.y
    }
    if (glyphMat) {
      glyphMat.uniforms.uTime.value = clock
      glyphMat.uniforms.uLand.value = landT
      glyphMat.uniforms.uHoverIdx.value = hoverIdx
      glyphMat.uniforms.uHoverStr.value = hoverStr
    }
    if (towerMat) {
      towerMat.uniforms.uTime.value = clock
      towerMat.uniforms.uLit.value = 0.2 + formT * 0.5 + landT * 0.42
    }
    if (panelMat) {
      panelMat.uniforms.uTime.value = clock
      panelMat.uniforms.uForm.value = formT
      panelMat.uniforms.uFocus.value = journey ? journey.f() : 0
    }
    if (orbMat) {
      orbMat.uniforms.uTime.value = clock
      orbMat.uniforms.uBright.value = 0.25 + formT * 0.15 + landT * 0.6
    }
    if (bodyMat) bodyMat.uniforms.uTime.value = clock
    if (ringMat) ringMat.uniforms.uTime.value = clock
    if (drone) {
      /* flies in during the landing phase, then idles beside the slab */
      const e = easeOut((landT - 0.12) / 0.88)
      const bobX = Math.cos(clock * 0.72) * 0.05 * e
      const bobY = Math.sin(clock * 1.05) * 0.07 * e
      drone.position.set(
        lerp(hover.x + 4.2, hover.x + bobX, e),
        lerp(3.8, hover.y + bobY, e),
        lerp(2.8, hover.z, e),
      )
      drone.rotation.y = Math.sin(clock * 0.42) * 0.3 - ptr.x * 0.7
      drone.rotation.z = Math.sin(clock * 0.9) * 0.05 - ptr.y * 0.15
      if (ringPivot) ringPivot.rotation.z = clock * 1.1
      if (eyeMat) {
        const cyc = (clock * 0.24) % 1
        const blink = cyc > 0.96 ? 0.15 : 1
        eyeMat.uniforms.uTime.value = clock
        eyeMat.uniforms.uScale.value = 1.15 * blink * (0.92 + 0.08 * Math.sin(clock * 2.1))
      }
    }
    if (postMat) {
      postMat.uniforms.uTime.value = clock
      postMat.uniforms.uFlash.value = flash
      postMat.uniforms.uGlitch.value = glitch
    }

    applyCamera()

    if (TIERS[tier].fx && rt) {
      renderer.setRenderTarget(rt)
      renderer.clear()
      renderer.render(bgScene, quadCam)
      renderer.render(scene, cam)
      renderer.setRenderTarget(null)
      renderer.clear()
      renderer.render(postScene, quadCam)
    } else {
      renderer.setRenderTarget(null)
      renderer.clear()
      renderer.render(bgScene, quadCam)
      renderer.render(scene, cam)
    }
  }

  let last = 0
  let lastDraw = 0

  function qualityTrack(dt: number) {
    if (reduced) return
    qAcc += dt
    qFrames++
    if (qAcc < 2.2) return
    const fps = qFrames / qAcc
    qAcc = 0
    qFrames = 0
    if (fps < 42 && tier < TIERS.length - 1) {
      tier++
      slowWindows = 0
      applySize()
    } else if (fps < 30 && tier === TIERS.length - 1) {
      slowWindows++
      if (slowWindows >= 2) fallbackStatic()
    } else {
      slowWindows = 0
    }
  }

  function loop(now: number) {
    if (!running || disposed) return
    raf = requestAnimationFrame(loop)

    const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
    last = now

    seq += dt
    clock += dt

    if (propHandle) propHandle.update(clock, dt)

    ptr.x = lerp(ptr.x, ptrT.x, clamp01(dt * 4))
    ptr.y = lerp(ptr.y, ptrT.y, clamp01(dt * 4))
    journey?.update(dt)
    orbit.yaw = lerp(orbit.yaw, orbitT.yaw, clamp01(dt * 6))
    orbit.pitch = lerp(orbit.pitch, orbitT.pitch, clamp01(dt * 6))
    orbit.zoom = lerp(orbit.zoom, orbitT.zoom, clamp01(dt * 5))
    // the look-around returns home on its own
    if (clock - exploreAt > 1.6 && (orbitT.yaw !== 0 || orbitT.pitch !== 0 || orbitT.zoom !== 0)) {
      orbitT.yaw = 0
      orbitT.pitch = 0
      orbitT.zoom = 0
    }

    updateTimeline(dt)

    // reduced motion gets ~30fps to save battery; time still advances above
    if (reduced && now - lastDraw < 32) return
    lastDraw = now

    renderFrame()
    updateHover()
    qualityTrack(dt)
  }

  /* ------------------------------- listeners ----------------------------- */

  function onResize() {
    applySize()
  }

  function isUiTarget(e: Event): boolean {
    const t = e.target as HTMLElement | null
    if (!t || typeof t.closest !== 'function') return false
    return !!t.closest('a, button, input, textarea, select, label, .prism-slab, .prism-dock, .prism-links, .prism-intro')
  }

  function onMove(e: PointerEvent) {
    ptrT.x = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1
    ptrT.y = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1)

    if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinch.size === 2) {
      const pts = [...pinch.values()]
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (pinchDist > 0) {
        orbitT.zoom = clamp(orbitT.zoom + (pinchDist - d) * 0.0016, -0.3, 0.55)
        markExplore()
      }
      pinchDist = d
      return
    }

    if (dragId === e.pointerId) {
      const dx = e.clientX - lastPointerX
      const dy = e.clientY - lastPointerY
      lastPointerX = e.clientX
      lastPointerY = e.clientY
      dragMoved += Math.abs(dx) + Math.abs(dy)
      if (dragMoved > 6) {
        orbitT.yaw = clamp(orbitT.yaw - dx * 0.0034, -0.9, 0.9)
        orbitT.pitch = clamp(orbitT.pitch + dy * 0.0022, -0.18, 0.34)
        markExplore()
      }
    }
  }

  function openFromHit(cx: number, cy: number) {
    const nx = (cx / Math.max(window.innerWidth, 1)) * 2 - 1
    const ny = -((cy / Math.max(window.innerHeight, 1)) * 2 - 1)
    const gi = hitTest(nx, ny)
    if (gi >= 0 && gi < glyphMeta.length && glyphMeta[gi].url) {
      lastOpenUrl = glyphMeta[gi].url
      window.open(lastOpenUrl, '_blank', 'noopener')
      return
    }
    const pi = panelHitTest(nx, ny)
    const url = pi >= 0 ? panelMeta[pi]?.url : undefined
    if (url) {
      lastOpenUrl = url
      window.open(url, '_blank', 'noopener')
    }
  }

  function onDown(e: PointerEvent) {
    if (disposed) return
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!revealed || !cam || isUiTarget(e)) return
    if (pinch.size === 1) {
      dragId = e.pointerId
      dragMoved = 0
      dragDownAt = performance.now()
      lastPointerX = e.clientX
      lastPointerY = e.clientY
    } else {
      dragId = null
      const pts = [...pinch.values()]
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    }
  }

  function onUp(e: PointerEvent) {
    pinch.delete(e.pointerId)
    if (pinch.size < 2) pinchDist = 0
    if (dragId === e.pointerId) {
      const wasClick = dragMoved <= 6 && performance.now() - dragDownAt < 450
      dragId = null
      if (wasClick && revealed) openFromHit(e.clientX, e.clientY)
    }
  }

  function onVis() {
    if (disposed || !started) return
    if (document.hidden) {
      stopLoop()
    } else if (!running && !stopped) {
      last = performance.now()
      lastDraw = 0
      running = true
      raf = requestAnimationFrame(loop)
    }
  }

  function onLost(e: Event) {
    e.preventDefault()
    fallbackStatic()
  }

  function attach() {
    canvas.style.touchAction = 'pan-y'
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    document.addEventListener('visibilitychange', onVis)
    canvas.addEventListener('webglcontextlost', onLost)
    offBus = onSpawn(e => {
      if (e.type === 'skip') skipToLand()
    })
  }

  /* --------------------------------- start ------------------------------- */

  async function start() {
    if (started || disposed) return
    started = true

    emitProgress(0.05, 'SIGNAL')
    emitSpawn({ type: 'phase', phase: 'boot', label: 'เชื่อมคลื่น' })

    try {
      T = await import('three')
      if (disposed) return
      emitProgress(0.4, 'RENDERER')
      await build()
      if (disposed) return
      emitProgress(0.72, 'FIELD')
      renderFrame()
      attach()

      // the journey — scroll drives the camera down the street
      journey = createJourney({ count: stations.length, reduced })
      journey.attach()
      offStation = journey.onChange((i, n) => {
        if (!disposed) emitSpawn({ type: 'station', i, n })
      })

      // real models stream in behind the first frame — mascot + city props
      void attachDistrictProps(T, scene as ThreeNS.Scene, {
        mirrorRoot,
        reduced,
        focus: () => journey?.f() ?? 0,
        getCam: () => cam,
      })
        .then((handle) => {
          if (disposed) {
            handle.dispose()
            return
          }
          propHandle = handle
        })
        .catch(() => {
          // decoration only — the district never waits on it
        })
      // reduced motion skips the entrance entirely — the name is already formed
      seq = reduced ? LAND_END + 0.01 : startSeq
      last = performance.now()
      lastDraw = 0
      running = true
      raf = requestAnimationFrame(loop)
      if (import.meta.dev) {
        ;(window as unknown as Record<string, unknown>).__prism = {
          orbit,
          orbitT,
          panelHover: () => panelHover,
          glyphHover: () => hoverIdx,
          lastOpen: () => lastOpenUrl,
          panelCount: () => panelMeta.length,
          hitAt: (x: number, y: number) => panelHitTest(x, y),
          props: () => propHandle?.count() ?? 0,
          flyer: () => propHandle?.flyer() ?? null,
          journey: {
            f: () => journey?.f() ?? 0,
            active: () => journey?.active() ?? 0,
            count: stations.length,
            labels: stations.map(s => s.label),
            snap: (i: number) => journey?.snapTo(i),
          },
          pose: () => ({
            cam: cam ? [Number(cam.position.x.toFixed(2)), Number(cam.position.y.toFixed(2)), Number(cam.position.z.toFixed(2))] : null,
            p: camP ? [Number(camP.x.toFixed(2)), Number(camP.y.toFixed(2)), Number(camP.z.toFixed(2))] : null,
            l: camL ? [Number(camL.x.toFixed(2)), Number(camL.y.toFixed(2)), Number(camL.z.toFixed(2))] : null,
            orbit: { yaw: Number(orbit.yaw.toFixed(3)), pitch: Number(orbit.pitch.toFixed(3)), zoom: Number(orbit.zoom.toFixed(3)) },
          }),
          boards: () => panelMeta.map((p, i) => ({ i, st: p.station, x: p.x, y: p.y, z: p.z })),
          ndc: (i: number) => {
            if (!cam || !vec) return null
            const p = panelMeta[i]
            if (!p) return null
            vec.set(p.x, p.y, p.z).project(cam)
            return {
              x: Number(vec.x.toFixed(3)),
              y: Number(vec.y.toFixed(3)),
              z: Number(vec.z.toFixed(3)),
              dist: Number(Math.hypot(cam.position.x - p.x, cam.position.y - p.y, cam.position.z - p.z).toFixed(2)),
            }
          },
          probe: (nx = 0, ny = 0) => {
            if (!T || !scene || !cam) return null
            const rc = new T.Raycaster()
            rc.setFromCamera(new T.Vector2(nx, ny), cam)
            return rc.intersectObjects(scene.children, true).slice(0, 6).map(h => ({
              name: h.object.name || h.object.type,
              dist: Number(h.distance.toFixed(2)),
              geo: (h.object as unknown as { geometry?: { type?: string } }).geometry?.type ?? null,
              mat: (h.object as unknown as { material?: { type?: string } }).material?.type ?? null,
            }))
          },
        }
      }
      // WebGL is live — the district becomes the presentation, DOM turns into HUD
      if (!reduced && !stopped) document.documentElement.classList.add('has-gl')
    } catch (err) {
      console.warn('[prism] scene failed to start', err)
      fallbackStatic()
    }
  }

  function destroy() {
    disposed = true
    stopLoop()
    offBus?.()
    offBus = null
    offStation?.()
    offStation = null
    journey?.detach()
    journey = null
    segCurves = []
    propHandle?.dispose()
    propHandle = null
    mirrorRoot = null
    document.documentElement.classList.remove('has-gl')
    document.documentElement.classList.remove('is-exploring')
    window.removeEventListener('resize', onResize)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.removeEventListener('visibilitychange', onVis)
    canvas.removeEventListener('webglcontextlost', onLost)
    disposables.forEach(d => {
      try {
        d.dispose()
      } catch {
        // noop
      }
    })
    disposables = []
    renderer = null
    rt = null
    scene = null
    bgScene = null
    postScene = null
    cam = null
    quadCam = null
    camP = null
    camL = null
    bgMat = null
    gridMat = null
    pointsMat = null
    motesMat = null
    glyphMat = null
    postMat = null
    towerMat = null
    panelMat = null
    orbMat = null
    bodyMat = null
    ringMat = null
    eyeMat = null
    drone = null
    ringPivot = null
    nameCloud = null
    vec = null
  }

  return { start, destroy }
}
