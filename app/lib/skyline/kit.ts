// SKYLINE — shared kit: deterministic seeds, the neon palette, and the canvas
// texture factories. Everything textual in this city (signs, stat screens,
// the portrait billboard, the QR board) is painted on the fly from the profile
// data, so any profile gets a fully custom skyline with zero baked images.

import * as THREE from 'three'

/** tiny deterministic PRNG — same seed, same city, every visit */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedFrom(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type NeonName = 'cyan' | 'magenta' | 'blue' | 'amber' | 'green'

/** linear-space neon colours — values above 1 make the bloom pass pick them up */
export const NEON: Record<NeonName, { r: number, g: number, b: number, css: string }> = {
  cyan: { r: 0.16, g: 1.75, b: 2.45, css: '#3df2ff' },
  magenta: { r: 2.25, g: 0.3, b: 1.7, css: '#ff3ad6' },
  blue: { r: 0.42, g: 0.95, b: 2.35, css: '#7d93ff' },
  amber: { r: 2.3, g: 1.2, b: 0.32, css: '#ffb35c' },
  green: { r: 0.25, g: 1.75, b: 1.15, css: '#4df0a6' },
}

export const NEON_NAMES: NeonName[] = ['cyan', 'magenta', 'blue', 'amber', 'green']

export function neonVec(name: NeonName): [number, number, number] {
  const n = NEON[name]
  return [n.r, n.g, n.b]
}

/** pick a weighted neon for city dressing (cyan/blue dominate like the ref) */
export function pickNeon(rand: () => number): NeonName {
  const r = rand()
  if (r < 0.4) return 'cyan'
  if (r < 0.62) return 'blue'
  if (r < 0.84) return 'magenta'
  if (r < 0.94) return 'amber'
  return 'green'
}

export const FONT = '"Chakra Petch", "Anuphan", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif'
export const FONT_MONO = '"Chakra Petch", ui-monospace, SFMono-Regular, Menlo, monospace'

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d')! }
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

interface GlowTextOpts {
  weight?: number
  glow?: number
  font?: string
  alpha?: number
}

export function glowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: GlowTextOpts = {},
) {
  ctx.save()
  ctx.font = `${opts.weight ?? 700} ${size}px ${opts.font ?? FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = opts.glow ?? size * 0.55
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha
  ctx.fillText(text, x, y)
  ctx.restore()
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700, font = FONT): number {
  let s = size
  ctx.font = `${weight} ${s}px ${font}`
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 2
    ctx.font = `${weight} ${s}px ${font}`
  }
  return s
}

export function neonFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  opts: { line?: number, glow?: number, radius?: number, fill?: string, corner?: number } = {},
) {
  const lw = opts.line ?? 5
  ctx.save()
  if (opts.fill) {
    roundRect(ctx, x, y, w, h, opts.radius ?? 10)
    ctx.fillStyle = opts.fill
    ctx.fill()
  }
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.shadowColor = color
  ctx.shadowBlur = opts.glow ?? lw * 4
  roundRect(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, opts.radius ?? 10)
  ctx.stroke()
  // corner ticks
  const ck = opts.corner ?? 0
  if (ck > 0) {
    ctx.lineWidth = lw * 1.4
    const pts: Array<[number, number, number, number]> = [
      [x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1],
    ]
    for (const [px, py, dx, dy] of pts) {
      ctx.beginPath()
      ctx.moveTo(px + dx * ck, py)
      ctx.lineTo(px, py)
      ctx.lineTo(px, py + dy * ck)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/* ------------------------------------------------------------------ signs -- */

export interface SignSpec {
  text: string
  sub?: string
  color: string
  /** paint glyphs stacked vertically (kaikei-style hanging sign) */
  vertical?: boolean
  w?: number
  h?: number
  /** phosphor tint of the dark backing */
  bg?: string
}

export function signTexture(spec: SignSpec): THREE.CanvasTexture {
  const vertical = Boolean(spec.vertical)
  const w = spec.w ?? (vertical ? 256 : 1024)
  const h = spec.h ?? (vertical ? 768 : 256)
  const { c, ctx } = makeCanvas(w, h)
  const bg = spec.bg ?? 'rgba(5, 8, 16, 0.66)'
  neonFrame(ctx, 8, 8, w - 16, h - 16, spec.color, { line: Math.max(3, w * 0.006), fill: bg, corner: 26, radius: 14 })

  if (vertical) {
    const chars = Array.from(spec.text)
    const size = fitText(ctx, chars[0] ?? '', w * 0.62, w * 0.5)
    const step = (h - 80) / Math.max(1, chars.length)
    chars.forEach((ch, i) => {
      glowText(ctx, ch, w / 2, 52 + step * (i + 0.5), Math.min(size, step * 0.78), spec.color)
    })
  } else {
    const sub = spec.sub?.trim()
    const size = fitText(ctx, spec.text, w * 0.84, h * (sub ? 0.4 : 0.46))
    glowText(ctx, spec.text, w / 2, sub ? h * 0.4 : h * 0.5, size, spec.color)
    if (sub) {
      const ss = fitText(ctx, sub, w * 0.8, h * 0.2, 600)
      glowText(ctx, sub, w / 2, h * 0.74, ss, '#cfe0ff', { weight: 600, glow: 10, alpha: 0.92 })
    }
  }
  return texture(c)
}

/* ------------------------------------------------------------- data boards -- */

export function statTexture(value: string, label: string, color: string): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 512)
  neonFrame(ctx, 10, 10, 492, 492, color, { line: 5, fill: 'rgba(4, 7, 14, 0.72)', corner: 40, radius: 18 })
  const vs = fitText(ctx, value, 400, 190, 700, FONT_MONO)
  glowText(ctx, value, 256, 218, vs, color)
  const ls = fitText(ctx, label.toUpperCase(), 400, 54, 600, FONT_MONO)
  glowText(ctx, label.toUpperCase(), 256, 384, ls, '#d7e6ff', { weight: 600, glow: 12, alpha: 0.95 })
  ctx.save()
  ctx.strokeStyle = 'rgba(210, 230, 255, 0.5)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(126, 310)
  ctx.lineTo(386, 310)
  ctx.stroke()
  ctx.restore()
  return texture(c)
}

export interface PortraitSpec {
  img: TexImageSource | null
  name: string
  handle: string
  tagline: string
  color: string
}

export function portraitTexture(spec: PortraitSpec): THREE.CanvasTexture {
  const W = 1024
  const H = 1280
  const { c, ctx } = makeCanvas(W, H)
  neonFrame(ctx, 12, 12, W - 24, H - 24, spec.color, { line: 7, fill: 'rgba(4, 7, 14, 0.78)', corner: 64, radius: 22 })

  const px = 92
  const py = 108
  const pw = W - px * 2
  const ph = 720
  ctx.save()
  ctx.fillStyle = 'rgba(8, 12, 22, 0.85)'
  ctx.fillRect(px, py, pw, ph)
  if (spec.img) {
    ctx.drawImage(spec.img, px, py, pw, ph)
  } else {
    glowText(ctx, '◈', W / 2, py + ph / 2, 240, spec.color, { alpha: 0.8 })
  }
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = spec.color
  ctx.lineWidth = 5
  ctx.shadowColor = spec.color
  ctx.shadowBlur = 22
  ctx.strokeRect(px, py, pw, ph)
  // scanlines over the portrait — holo feel
  ctx.globalAlpha = 0.16
  ctx.fillStyle = '#8fe8ff'
  for (let y = py + 4; y < py + ph; y += 8) ctx.fillRect(px, y, pw, 1.6)
  ctx.restore()

  const ns = fitText(ctx, spec.name, W - 180, 116)
  glowText(ctx, spec.name, W / 2, py + ph + 92, ns, '#f2f8ff', { glow: 26 })
  const hs = fitText(ctx, spec.handle, W - 200, 54, 600, FONT_MONO)
  glowText(ctx, spec.handle, W / 2, py + ph + 178, hs, spec.color, { weight: 600, glow: 16 })
  const ts = fitText(ctx, spec.tagline, W - 200, 44, 500)
  glowText(ctx, spec.tagline, W / 2, py + ph + 252, ts, '#c9d9f2', { weight: 500, glow: 8, alpha: 0.94 })
  return texture(c)
}

export function plateTexture(label: string, color: string, sub?: string): THREE.CanvasTexture {
  const W = 640
  const H = sub ? 320 : 256
  const { c, ctx } = makeCanvas(W, H)
  neonFrame(ctx, 8, 8, W - 16, H - 16, color, { line: 5, fill: 'rgba(4, 7, 14, 0.7)', corner: 34, radius: 14 })
  const ls = fitText(ctx, label, W - 110, H * (sub ? 0.36 : 0.42), 700, FONT_MONO)
  glowText(ctx, label, W / 2, sub ? H * 0.36 : H * 0.5, ls, color)
  if (sub) {
    const ss = fitText(ctx, sub, W - 90, H * 0.24, 500)
    glowText(ctx, sub, W / 2, H * 0.72, ss, '#cfe0ff', { weight: 500, glow: 8, alpha: 0.92 })
  }
  return texture(c)
}

export function musicTexture(title: string, artist: string, color: string, kicker = 'NOW PLAYING'): THREE.CanvasTexture {
  const W = 1024
  const H = 384
  const { c, ctx } = makeCanvas(W, H)
  neonFrame(ctx, 10, 10, W - 20, H - 20, color, { line: 6, fill: 'rgba(4, 7, 14, 0.72)', corner: 48, radius: 16 })
  glowText(ctx, `♪ ${kicker}`, W / 2, 86, 44, '#cfe0ff', { weight: 600, glow: 12, alpha: 0.9 })
  const ts = fitText(ctx, title, W - 160, 96)
  glowText(ctx, title, W / 2, 196, ts, color)
  const as = fitText(ctx, artist, W - 200, 46, 600)
  glowText(ctx, artist, W / 2, 294, as, '#d7e6ff', { weight: 600, glow: 10, alpha: 0.95 })
  return texture(c)
}

export interface QrBoardSpec {
  qr: TexImageSource | null
  title: string
  sub: string
  color: string
}

/** the landing pad board — QR + copy, straight from the share URL */
export function qrBoardTexture(spec: QrBoardSpec): THREE.CanvasTexture {
  const W = 1024
  const H = 1024
  const { c, ctx } = makeCanvas(W, H)
  neonFrame(ctx, 12, 12, W - 24, H - 24, spec.color, { line: 8, fill: 'rgba(4, 7, 14, 0.82)', corner: 72, radius: 24 })
  glowText(ctx, spec.title, W / 2, 108, fitText(ctx, spec.title, W - 220, 74), '#f2f8ff', { glow: 24 })
  const qs = 560
  const qx = (W - qs) / 2
  const qy = 178
  ctx.save()
  ctx.fillStyle = '#eaf4ff'
  roundRect(ctx, qx - 22, qy - 22, qs + 44, qs + 44, 18)
  ctx.shadowColor = spec.color
  ctx.shadowBlur = 30
  ctx.fill()
  ctx.restore()
  if (spec.qr) ctx.drawImage(spec.qr, qx, qy, qs, qs)
  glowText(ctx, spec.sub, W / 2, qy + qs + 118, fitText(ctx, spec.sub, W - 220, 56, 600, FONT_MONO), spec.color, { weight: 600, glow: 16 })
  return texture(c)
}

export function brandTexture(text: string, color: string): THREE.CanvasTexture {
  const W = 1024
  const H = 256
  const { c, ctx } = makeCanvas(W, H)
  const s = fitText(ctx, text, W - 120, 120, 700, FONT_MONO)
  glowText(ctx, text, W / 2, H / 2, s, color, { glow: 34 })
  return texture(c)
}

/** soft vertical gradient — used for light beams and the horizon skyglow */
export function beamTexture(color: string, soft = 0.75): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(64, 512)
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(0.55, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = soft
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 512)
  return texture(c)
}
