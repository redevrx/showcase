// SKYLINE — the data layer.
// Every piece of profile data becomes a landmark in the city: the name sign on
// a rooftop, the portrait billboard, stat screens, link shopfronts (clickable),
// the music equaliser, social plaques and the rooftop gate with the share QR.
// The city is sculpted by the profile — no data, no landmark, no broken scene.

import * as THREE from 'three'
import type { Profile } from '~/types/profile'
import {
  mulberry32,
  seedFrom,
  NEON,
  makeCanvas,
  roundRect,
  glowText,
  signTexture,
  plateTexture,
  statTexture,
  portraitTexture,
  musicTexture,
  qrBoardTexture,
  brandTexture,
  beamTexture,
} from './kit'
import { PAD, type Rail } from './rail'
import type { BeatId } from './beats'
import type { FacadeSlot } from './generator'

export interface Interactive {
  obj: THREE.Object3D
  url: string
  label: string
}

export interface LandmarkHandle {
  group: THREE.Group
  foci: Map<BeatId, THREE.Vector3>
  interactive: Interactive[]
  update(t: number): void
  dispose(): void
}

export interface LandmarkOpts {
  profile: Profile
  slots: FacadeSlot[]
  /** tower volumes for line-of-sight checks */
  towers: ReadonlyArray<{ x: number, z: number, w: number, d: number, h: number }>
  rail: Rail
  /** absolute share URL for the QR gate */
  shareUrl: string
  tier: number
  /** viewport aspect (w/h) — narrow/portrait screens get a tighter sideways cone */
  aspect?: number
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function cssColor(v: string | undefined, fallback: string): string {
  return v && HEX_RE.test(v) ? v : fallback
}

function neonFromCss(css: string): 'amber' | 'magenta' | 'cyan' | 'green' | 'blue' {
  const h = css.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if (r > g && g >= b && r > b * 1.35) return 'amber'
  if (r > b) return 'magenta'
  if (g > r && g > b && g > r * 1.3) return 'green'
  if (b > r && b > g) return 'blue'
  return 'cyan'
}

function prettyHost(url: string): string {
  try {
    const u = new URL(url)
    return (u.host + u.pathname).replace(/^www\./, '').replace(/\/$/, '')
  } catch {
    return url
  }
}

function loadImage(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** roadside QR plate — light modules on a dark floor, read from the south */
function qrFloorTexture(qr: TexImageSource, color: string, handle: string): THREE.CanvasTexture {
  const S = 1024
  const { c, ctx } = makeCanvas(S, S)
  const pad = 96
  ctx.save()
  ctx.fillStyle = '#dfeaf7'
  ctx.shadowColor = color
  ctx.shadowBlur = 70
  roundRect(ctx, pad - 40, pad - 40, S - pad * 2 + 80, S - pad * 2 + 80, 30)
  ctx.fill()
  ctx.restore()
  ctx.drawImage(qr, pad, pad, S - pad * 2, S - pad * 2)
  // glow corner ticks
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 16
  ctx.shadowColor = color
  ctx.shadowBlur = 48
  const t = 130
  const o = 8
  const corners: Array<[number, number, number, number]> = [
    [o, o, 1, 1], [S - o, o, -1, 1], [o, S - o, 1, -1], [S - o, S - o, -1, -1],
  ]
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath()
    ctx.moveTo(x + dx * t, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + dy * t)
    ctx.stroke()
  }
  ctx.restore()
  glowText(ctx, handle, S / 2, S - 46, 46, color, { weight: 600, glow: 20 })
  glowText(ctx, 'SCAN TO OPEN', S / 2, 50, 42, '#cfe6ff', { weight: 600, glow: 14, alpha: 0.95 })
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export async function createLandmarks(opts: LandmarkOpts): Promise<LandmarkHandle> {
  const { profile, slots, towers, rail, shareUrl, tier } = opts
  const rand = mulberry32(seedFrom(profile.username) ^ 0x51ed)
  const group = new THREE.Group()
  group.name = 'skyline-data'

  const texes: THREE.Texture[] = []
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const foci = new Map<BeatId, THREE.Vector3>()
  const interactive: Interactive[] = []
  const flickers: Array<{ mat: THREE.MeshBasicMaterial, base: number, phase: number }> = []
  const pulse: THREE.MeshBasicMaterial[] = []
  const equalizers: Array<{
    barMesh: THREE.InstancedMesh
    bars: number
    rowW: number
    baseY: number
    x: number
    y: number
    z: number
    yaw: number
    bx: number
    bz: number
  }> = []

  const primaryCss = cssColor(profile.theme?.primary, NEON.cyan.css)
  const accentCss = cssColor(profile.theme?.accent, NEON.magenta.css)

  const used = new Set<FacadeSlot>()

  // Narrow (portrait) viewports slice much less of the world horizontally, so a
  // sign sized for a landscape frame overflows it. Scale landmark planes by the
  // horizontal squeeze — landscape aspects (>= 1.15) are untouched.
  const aspect = opts.aspect ?? 16 / 9
  const SZ = aspect < 1.15 ? clamp((0.4663 * aspect) / 0.83, 0.3, 1) : 1

  const _sp = new THREE.Vector3()
  const _sd = new THREE.Vector3()
  const _bp = new THREE.Vector3()
  const _bd = new THREE.Vector3()
  const _bp2 = new THREE.Vector3()
  const _bd2 = new THREE.Vector3()
  const _mount = new THREE.Vector3()

  /**
   * Rough line-of-sight: march the segment in XZ and fail when it passes
   * through a tower volume. Signs behind a nearer block are unreadable, so
   * they should never win a slot.
   */
  function lineClear(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    host?: { x: number, z: number, w: number, d: number, h: number },
  ): boolean {
    const dx = bx - ax
    const dy = by - ay
    const dz = bz - az
    const span = Math.hypot(dx, dz)
    const steps = Math.min(40, Math.max(4, Math.round(span / 6)))
    // skip the ends: the sign sits on (or right next to) its own wall
    for (let i = 1; i < steps; i++) {
      const f = 0.1 + (0.8 * i) / steps
      const px = ax + dx * f
      const py = ay + dy * f
      const pz = az + dz * f
      for (const t of towers) {
        if (t === host) continue
        if (py < t.h && Math.abs(px - t.x) < t.w / 2 + 0.1 && Math.abs(pz - t.z) < t.d / 2 + 0.1) {
          return false
        }
      }
    }
    return true
  }
  /** 1 = this face looks straight into the incoming camera */
  function alignAt(s: FacadeSlot): number {
    rail.sample(Math.min(rail.length, s.arc * rail.length), _sp, _sd)
    const nx = Math.sin(s.yaw)
    const nz = Math.cos(s.yaw)
    return nx * -_sd.x + nz * -_sd.z
  }

  /**
   * Slide a sign along its wall toward the street, so the camera actually sees
   * it: a face centred 20m off the street axis would never enter the frame,
   * but its near edge would. Slides against the corridor point *beside the
   * slot* — the nearest rail point anywhere may belong to another leg.
   */
  function mountPos(s: FacadeSlot, w: number, out?: THREE.Vector3): THREE.Vector3 {
    const v = out ?? new THREE.Vector3()
    rail.sample(Math.min(rail.length, s.arc * rail.length), _sp, _sd)
    const tx = Math.cos(s.yaw)
    const tz = -Math.sin(s.yaw)
    let off = (_sp.x - s.x) * tx + (_sp.z - s.z) * tz
    const lim = Math.max(0, s.w / 2 - w / 2)
    off = Math.min(lim, Math.max(-lim, off))
    return v.set(s.x + tx * off, s.y, s.z + tz * off)
  }

  /**
   * Fetch a slot whose sign will actually be readable at beat `t`: inside the
   * corridor's view cone from the beat camera (small lateral angle), a touch
   * ahead so it dwells in frame, and facing back down the flight.
   */
  function pick(
    t: number,
    kinds: Array<FacadeSlot['kind']>,
    o: {
      minW?: number
      yMin?: number
      yMax?: number
      alignMin?: number
      /** extra arc fraction ahead of the beat camera */
      ahead?: number
      /** widest offset from the flight direction (radians) */
      maxAng?: number
      /** plane width used for the slide, defaults to s.w * 0.75 */
      mountW?: number
      /** arc half-window around the target, defaults to 0.05 */
      arcWin?: number
    } = {},
  ): FacadeSlot | null {
    const arc = rail.warp.warp(t)
    rail.sample(arc * rail.length, _bp, _bd)
    rail.sample(Math.max(0, arc - 0.012) * rail.length, _bp2, _bd2)
    const target = arc + (o.ahead ?? 0.02)
    // horizontal heading: the vertical dive must not skew the cone test
    const hLen = Math.hypot(_bd.x, _bd.z) || 1
    const hx = _bd.x / hLen
    const hz = _bd.z / hLen
    let best: FacadeSlot | null = null
    let bestScore = Infinity
    const seen = import.meta.dev ? { kind: 0, size: 0, align: 0, arc: 0, dist: 0, cone: 0, sight: 0 } : null
    for (const s of slots) {
      if (used.has(s)) continue
      if (!kinds.includes(s.kind)) continue
      seen && seen.kind++
      if (o.minW != null && s.w < o.minW) continue
      if (o.yMin != null && s.y < o.yMin) continue
      if (o.yMax != null && s.y > o.yMax) continue
      seen && seen.size++
      if (o.alignMin != null && alignAt(s) < o.alignMin) continue
      seen && seen.align++
      const dArc = Math.abs(s.arc - target)
      if (dArc > (o.arcWin ?? 0.05)) continue
      seen && seen.arc++
      mountPos(s, o.mountW ?? s.w * 0.75, _mount)
      const ex = _mount.x - _bp.x
      const ez = _mount.z - _bp.z
      const ey = _mount.y - _bp.y
      const flat = Math.hypot(ex, ez) || 1e-4
      const dist = Math.hypot(flat, ey)
      if (dist < 14 || dist > 130) continue
      seen && seen.dist++
      // how far sideways of the heading, and how far up/down from the camera
      const angH = Math.acos(clamp((ex * hx + ez * hz) / flat, -1, 1))
      const pitch = Math.atan2(ey, flat)
      // compare against the camera's own (damped) view axis, not the horizon:
      // a sign can sit well below the horizon and still be dead centre
      const viewPitch = Math.atan2(_bd.y * 0.78, Math.hypot(_bd.x, _bd.z))
      const rel = pitch - viewPitch
      if (angH > (o.maxAng ?? 0.75) || rel > 0.75 || rel < -1.0) continue
      seen && seen.cone++
      // and it has to be visible from the approach as well as at the beat —
      // ignoring the tower the sign itself is mounted on
      const bnx = Math.sin(s.yaw)
      const bnz = Math.cos(s.yaw)
      const hx2 = _mount.x - bnx * 0.8
      const hz2 = _mount.z - bnz * 0.8
      let host: (typeof towers)[number] | undefined
      for (const t of towers) {
        if (Math.abs(hx2 - t.x) < t.w / 2 + 0.6 && Math.abs(hz2 - t.z) < t.d / 2 + 0.6) {
          host = t
          break
        }
      }
      const visible = lineClear(_bp2.x, _bp2.y, _bp2.z, _mount.x, _mount.y, _mount.z, host)
        && lineClear(_bp.x, _bp.y, _bp.z, _mount.x, _mount.y, _mount.z, host)
      if (!visible) {
        if (seen) console.info('[skyline] sight miss', t, JSON.stringify({ mount: [+_mount.x.toFixed(0), +_mount.y.toFixed(0), +_mount.z.toFixed(0)], cam: [+_bp.x.toFixed(0), +_bp.y.toFixed(0), +_bp.z.toFixed(0)], dArc: +dArc.toFixed(3), angH: +angH.toFixed(2), rel: +rel.toFixed(2) }))
        continue
      }
      seen && seen.sight++
      const score = dArc * 60 + angH * 1.4 + Math.abs(dist - 42) * 0.02
      if (score < bestScore) {
        bestScore = score
        best = s
      }
    }
    if (!best && seen) console.warn('[skyline] no slot', t, kinds.join('/'), JSON.stringify(seen))
    if (best) used.add(best)
    return best
  }

  function addPlane(
    tex: THREE.Texture,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    o: { additive?: boolean, opacity?: number, renderOrder?: number, tiltX?: number } = {},
  ): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(w * SZ, h * SZ)
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    if (o.additive !== false) mat.blending = THREE.AdditiveBlending
    mat.opacity = o.opacity ?? 1
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    if (o.tiltX != null) mesh.rotation.set(o.tiltX, 0, 0)
    else mesh.rotation.y = yaw
    mesh.renderOrder = o.renderOrder ?? 3
    group.add(mesh)
    geos.push(geo)
    mats.push(mat)
    return mesh
  }

  function addBeam(x: number, y0: number, y1: number, z: number, w: number, css: string, opacity: number) {
    const h = y1 - y0
    const tex = beamTexture(css, 0.7)
    texes.push(tex)
    for (const rot of [0, Math.PI / 2]) {
      const geo = new THREE.PlaneGeometry(w, h)
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, y0 + h / 2, z)
      mesh.rotation.y = rot
      mesh.renderOrder = 2
      group.add(mesh)
      geos.push(geo)
      mats.push(mat)
    }
  }

  /* --------------------------------------------------------------- the gate */

  let qrImg: HTMLImageElement | null = null
  try {
    const mod = await import('qrcode')
    const QR = (mod as unknown as { default?: typeof mod }).default ?? mod
    const dataUrl = await QR.toDataURL(shareUrl, {
      margin: 0,
      errorCorrectionLevel: 'M',
      width: 512,
      color: { dark: '#05070d', light: '#eef5ff' },
    })
    qrImg = await loadImage(dataUrl)
  } catch {
    qrImg = null
  }

  if (qrImg) {
    // floor plate — read on approach from the south
    const floorTex = qrFloorTexture(qrImg, accentCss, `@${profile.username}`)
    texes.push(floorTex)
    addPlane(floorTex, 13, 13, PAD.x, PAD.roofY + 0.06, PAD.z, 0, {
      additive: false,
      tiltX: -Math.PI / 2,
      renderOrder: 3,
    })
    // wall board on the north rim, facing the pad — the landing frame
    const boardTex = qrBoardTexture({ qr: qrImg, title: profile.displayName, sub: prettyHost(shareUrl), color: accentCss })
    texes.push(boardTex)
    const board = addPlane(boardTex, 11, 11, PAD.x, PAD.roofY + 6.6, PAD.z - PAD.half + 0.45, 0, {
      additive: false,
      renderOrder: 3,
    })
    interactive.push({ obj: board, url: shareUrl, label: 'เปิดโปรไฟล์ (QR)' })
    // neon ring on the floor in front of the board
    const ringTex = signTexture({ text: 'SKYLINE // GATE', color: accentCss, w: 1024, h: 160 })
    texes.push(ringTex)
    addPlane(ringTex, 12, 1.9, PAD.x, PAD.roofY + 1.25, PAD.z - PAD.half + 2.1, 0, { opacity: 0.95 })
  } else {
    const fallbackTex = signTexture({ text: `@${profile.username}`, sub: 'SKYLINE', color: accentCss })
    texes.push(fallbackTex)
    addPlane(fallbackTex, 11, 2.8, PAD.x, PAD.roofY + 1.6, PAD.z - PAD.half + 2, 0)
  }

  const brandTex = brandTexture('SPAWN // SKYLINE', primaryCss)
  texes.push(brandTex)
  addPlane(brandTex, 13, 3.2, PAD.x, PAD.roofY + 14.4, PAD.z - PAD.half + 0.5, 0)
  addBeam(PAD.x, PAD.roofY + 1.4, PAD.roofY + 92, PAD.z - PAD.half + 1.6, 5, accentCss, 0.45)
  foci.set('gate', new THREE.Vector3(PAD.x, PAD.roofY + 3.4, PAD.z))

  /* ------------------------------------------------------------ name + entry */

  const nameSlot = pick(0.13, ['roof'], { minW: 12, alignMin: 0.35, ahead: 0.06, maxAng: 0.72 }) || pick(0.13, ['roof', 'facade'], { minW: 12, yMin: 26, alignMin: 0.3, ahead: 0.06, maxAng: 0.85 })
  if (nameSlot) {
    const w = Math.min(40, Math.max(26, nameSlot.w * 1.5))
    const tex = signTexture({ text: profile.displayName, sub: `@${profile.username}`, color: primaryCss, w: 1024, h: 384 })
    texes.push(tex)
    const np = mountPos(nameSlot, w)
    const sign = addPlane(tex, w, w * 0.375, np.x, np.y, np.z, nameSlot.yaw)
    flickers.push({ mat: sign.material as THREE.MeshBasicMaterial, base: 1, phase: rand() * 6 })
    foci.set('name', np.clone())

    const plateTex = signTexture({ text: profile.status === 'live' ? '● LIVE NOW' : 'ONLINE', color: accentCss, w: 512, h: 160 })
    texes.push(plateTex)
    const tx = Math.cos(nameSlot.yaw)
    const tz = -Math.sin(nameSlot.yaw)
    const side = rand() < 0.5 ? -1 : 1
    addPlane(plateTex, w * 0.42, w * 0.42 * 0.31, np.x + tx * side * (w / 2 + w * 0.24), np.y - w * 0.1, np.z + tz * side * (w / 2 + w * 0.24), nameSlot.yaw)
  }

  // gateway — brand over the city edge + light columns, seen on the way in
  const gateCap = pick(0.1, ['roof'], { minW: 10, alignMin: 0.35, maxAng: 0.7 }) || pick(0.16, ['roof', 'facade'], { alignMin: 0.3, maxAng: 0.85 })
  if (gateCap) {
    const tex = brandTexture('SPAWN', accentCss)
    texes.push(tex)
    const gp = mountPos(gateCap, 15)
    addPlane(tex, 15, 3.7, gp.x, gp.y + 6, gp.z, gateCap.yaw, { opacity: 0.92 })
  }
  addBeam(-70, 0.5, 236, 236, 3.5, primaryCss, 0.22)
  addBeam(28, 0.5, 252, 252, 3.5, accentCss, 0.2)
  foci.set('entry', new THREE.Vector3(-21, 60, 150))

  /* -------------------------------------------------------------- portrait */

  const avatar = await loadImage(profile.avatar)
  const portraitSlot = pick(0.205, ['facade'], { minW: 13, yMin: 20, yMax: 72, alignMin: 0.45, ahead: 0.05, arcWin: 0.05, maxAng: 0.85 })
  if (portraitSlot) {
    const ph = Math.min(20, Math.max(13, portraitSlot.w * 1.05))
    const pw = ph * 0.8
    const tex = portraitTexture({
      img: avatar,
      name: profile.displayName,
      handle: `@${profile.username}`,
      tagline: profile.tagline,
      color: accentCss,
    })
    texes.push(tex)
    const pp = mountPos(portraitSlot, pw)
    const mesh = addPlane(tex, pw, ph, pp.x, pp.y, pp.z, portraitSlot.yaw, { additive: false, opacity: 0.99 })
    pulse.push(mesh.material as THREE.MeshBasicMaterial)
    foci.set('portrait', pp.clone())
  }

  /* ---------------------------------------------------------------- stats --- */

  const stats = profile.stats
  if (stats) {
    const defs: Array<[string, string]> = []
    if (stats.views != null) defs.push([stats.views.toLocaleString('en-US'), 'VIEWS'])
    if (stats.likes != null) defs.push([stats.likes.toLocaleString('en-US'), 'LIKES'])
    if (stats.since) defs.push([stats.since, 'SINCE'])
    const colors = [primaryCss, accentCss, NEON.green.css]
    defs.slice(0, 3).forEach((d, i) => {
      const slot = pick(0.393 + i * 0.022, ['facade', 'street'], { minW: 8, yMin: 5, yMax: 70, alignMin: 0.2, ahead: 0.04, arcWin: 0.035, maxAng: 0.75 })
      if (!slot) return
      const tex = statTexture(d[0], d[1], colors[i % colors.length]!)
      texes.push(tex)
      const size = Math.min(9.5, Math.max(6.4, slot.w * 0.72))
      const sp = mountPos(slot, size)
      addPlane(tex, size, size, sp.x, sp.y, sp.z, slot.yaw)
      if (i === 1) foci.set('stats', sp.clone())
    })
  }

  /* ---------------------------------------------------------------- badges -- */

  const badges = profile.badges ?? []
  badges.slice(0, 4).forEach((badge, i) => {
    const slot = pick(0.315 + i * 0.014, ['facade', 'street'], { minW: 6, yMax: 46, alignMin: 0.25, maxAng: 0.85, ahead: 0.055 })
    if (!slot) return
    const tone = badge.tone === 'accent' ? accentCss
      : badge.tone === 'live' ? NEON.green.css
        : badge.tone === 'primary' ? primaryCss
          : NEON.blue.css
    const tex = plateTexture(badge.label, tone)
    texes.push(tex)
    const w = Math.min(9, Math.max(5.4, slot.w * 0.75))
    const bp = mountPos(slot, w)
    addPlane(tex, w, w * 0.4, bp.x, bp.y, bp.z, slot.yaw)
  })

  /* ---------------------------------------------------------------- links --- */

  const links = (profile.links ?? []).slice(0, 6)
  const linkColors = [accentCss, NEON.cyan.css, NEON.magenta.css, primaryCss, NEON.green.css, NEON.blue.css]
  links.forEach((link, i) => {
    const t = links.length > 1 ? 0.5 + i * (0.13 / (links.length - 1)) : 0.55
    const vertical = i % 3 === 1
    const slot = vertical
      ? pick(t, ['street', 'facade'], { minW: 4, yMax: 34, alignMin: -0.2, maxAng: 0.95, ahead: 0.02, mountW: 3.4 })
      : pick(t, ['street', 'facade'], { minW: 7, yMax: 38, alignMin: -0.2, maxAng: 0.95, ahead: 0.02, mountW: 8 })
    if (!slot) return
    const color = linkColors[i % linkColors.length]!
    const sub = (link.meta && link.meta.trim()) || `${prettyHost(link.url)} ↗`
    const tex = vertical
      ? signTexture({ text: link.label, sub: undefined, color, vertical: true, w: 256, h: 768 })
      : signTexture({ text: link.label, sub, color, w: 1024, h: 320 })
    texes.push(tex)
    const w = vertical ? 3.4 : Math.min(10.5, Math.max(7, slot.w * 0.8))
    const h = vertical ? 10.8 : w * 0.3125
    const lp = mountPos(slot, w)
    const mesh = addPlane(tex, w, h, lp.x, lp.y, lp.z, slot.yaw)
    interactive.push({ obj: mesh, url: link.url, label: link.label })
    if (i === Math.floor(links.length / 2)) {
      flickers.push({ mat: mesh.material as THREE.MeshBasicMaterial, base: 1, phase: rand() * 6 })
      foci.set('links', lp.clone())
    }
  })

  /* ---------------------------------------------------------------- music --- */

  const np = profile.nowPlaying
  if (np && (np.title || np.artist)) {
    const slot = pick(0.7, ['facade'], { minW: 9, yMin: 10, yMax: 60, alignMin: 0.4, ahead: 0.06, maxAng: 0.8, mountW: 12.5, arcWin: 0.055 })
    if (slot) {
      const tex = musicTexture(np.title, np.artist, accentCss, np.playing ? 'NOW PLAYING' : 'LAST TRACK')
      texes.push(tex)
      const w = Math.min(15, Math.max(10, slot.w * 0.8))
      const mp = mountPos(slot, w)
      addPlane(tex, w, w * 0.375, mp.x, mp.y, mp.z, slot.yaw)

      // equaliser — bars grow with the clock
      const bars = 18
      const rowW = Math.min(24, w * 1.3) * SZ
      const barGeo = new THREE.PlaneGeometry(1, 1)
      barGeo.translate(0, 0.5, 0)
      const barMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      })
      const barMesh = new THREE.InstancedMesh(barGeo, barMat, bars)
      barMesh.renderOrder = 3
      const c = new THREE.Color(...neonVecOf(accentCss))
      for (let i = 0; i < bars; i++) {
        barMesh.setColorAt(i, c)
      }
      if (barMesh.instanceColor) barMesh.instanceColor.needsUpdate = true
      group.add(barMesh)
      geos.push(barGeo)
      mats.push(barMat)
      barMesh.matrixAutoUpdate = false

      const bx = Math.cos(slot.yaw)
      const bz = -Math.sin(slot.yaw)
      const eq = {
        barMesh,
        bars,
        rowW,
        baseY: slot.y - 7.6 * SZ,
        x: mp.x,
        y: slot.y,
        z: mp.z,
        yaw: slot.yaw,
        bx,
        bz,
      }
      equalizers.push(eq)
      foci.set('music', new THREE.Vector3(mp.x, slot.y - 2 * SZ, mp.z))
    }
  }

  /* ------------------------------------------------------------- socials --- */

  const socials = (profile.socials ?? []).slice(0, 5)
  socials.forEach((so, i) => {
    const t = socials.length > 1 ? 0.775 + i * (0.055 / (socials.length - 1)) : 0.8
    const slot = pick(t, ['facade', 'street'], { minW: 5, yMax: 46, alignMin: -0.2, maxAng: 1.1, ahead: 0.04, arcWin: 0.055 })
    if (!slot) return
    const tex = plateTexture(so.platform.toUpperCase(), primaryCss, so.handle || prettyHost(so.url))
    texes.push(tex)
    const w = Math.min(8, Math.max(5.6, slot.w * 0.7))
    const sp = mountPos(slot, w)
    const mesh = addPlane(tex, w, w * 0.5, sp.x, sp.y, sp.z, slot.yaw)
    interactive.push({ obj: mesh, url: so.url, label: so.platform })
    if (i === 0) foci.set('connect', sp.clone())
  })

  /* ------------------------------------------------------------ animation --- */

  const m4 = new THREE.Matrix4()
  const q4 = new THREE.Quaternion()
  const v4 = new THREE.Vector3()
  const s4 = new THREE.Vector3()
  const axisY = new THREE.Vector3(0, 1, 0)

  function update(t: number) {
    for (const f of flickers) {
      const d = Math.sin(t * 1.7 + f.phase * 2.3)
      const wobble = 0.9 + 0.1 * Math.sin(t * 9 + f.phase)
      f.mat.opacity = d > 0.997 ? f.base * 0.32 : f.base * wobble
    }
    for (const m of pulse) {
      m.opacity = 0.9 + 0.08 * Math.sin(t * 2.1)
    }
    for (const eq of equalizers) {
      for (let i = 0; i < eq.bars; i++) {
        const ph = i * 0.77
        const v = Math.abs(Math.sin(t * 2.4 + ph)) * 0.6 + Math.abs(Math.sin(t * 5.3 + ph * 1.7)) * 0.4
        const h = 1 + v * 6.5
        const u = (i + 0.5) / eq.bars - 0.5
        v4.set(eq.x + eq.bx * u * eq.rowW, eq.baseY, eq.z + eq.bz * u * eq.rowW)
        q4.setFromAxisAngle(axisY, eq.yaw)
        s4.set(eq.rowW / eq.bars - 0.35 * SZ, h * SZ, 1)
        m4.compose(v4, q4, s4)
        eq.barMesh.setMatrixAt(i, m4)
      }
      eq.barMesh.instanceMatrix.needsUpdate = true
    }
  }

  // prime the equalisers so the first frame isn't a row of zero-height bars
  update(0)

  const dispose = () => {
    for (const t of texes) t.dispose()
    for (const g of geos) g.dispose()
    for (const m of mats) m.dispose()
    group.clear()
  }

  return { group, foci, interactive, update, dispose }
}

function neonVecOf(css: string): [number, number, number] {
  const name = neonFromCss(css)
  const n = NEON[name]
  return [n.r, n.g, n.b]
}
