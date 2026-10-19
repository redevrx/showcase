// PRISM — holo billboards.
// Draws one atlas (4×4 cells) of neon signage built from the profile's own
// data — handle, name, badges, stats, links (one board per link), socials,
// now playing, avatar — so the city around the profile is literally made of
// its identity. Extra cells hold the district dressing: the mascot, a
// vertical kana sign, a hazard board and a data wall. One canvas, one
// texture, one draw call; the shader adds flicker/tear/hover on top.

import type * as ThreeNS from 'three'
import type { Profile } from '~/types/profile'

export interface PanelAtlas {
  texture: ThreeNS.Texture
  /** atlas cell bounds in uv (already padded, ready for clamping) */
  cells: Array<{ min: [number, number]; max: [number, number] }>
}

const COLS = 4
const ROWS = 4
const CELL = 512
const PAD_U = 2 / (COLS * CELL) * 2
const PAD_V = 2 / (ROWS * CELL) * 2

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const DISPLAY = 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
const JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif'

/* neon palette — the district's own ink */
const PINK = '#ff2f6d'
const CYAN = '#38e8ff'
const AMBER = '#ffc83d'
const RED = '#ff4549'
const VIOLET = '#b45cff'
const WHITE = '#ffffff'

const KANA = ['プロフィール', 'ネーム', 'オンエア', 'ステータス', 'リンク', 'コネクト', 'スキャン', 'アイディー']
const CHONK = [PINK, CYAN, AMBER, VIOLET]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  maxWidth: number,
  start: number,
  family: string = MONO,
): number {
  let size = start
  do {
    ctx.font = `${weight} ${size}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 3
  } while (size > 14)
  return size
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let s = text
  while (s.length > 2 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1)
  return s + '…'
}

function glowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  glow: string,
  weight = 800,
  family: string = DISPLAY,
  blur = 26,
) {
  ctx.save()
  ctx.shadowColor = glow
  ctx.shadowBlur = blur
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px ${family}`
  ctx.fillText(text, x, y)
  ctx.restore()
}

function scanlines(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.05) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = `rgba(255,255,255,${alpha})`
  for (let yy = y; yy < y + h; yy += 4) ctx.fillRect(x, yy, w, 1)
  ctx.restore()
}

function noiseDots(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, n = 70) {
  ctx.save()
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.3)'
    ctx.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 2, 1)
  }
  ctx.restore()
}

function barcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  let cx = x
  while (cx < x + w - 2) {
    const bw = 1 + Math.floor(rnd() * 4)
    if (rnd() > 0.35) ctx.fillRect(cx, y, bw, h)
    cx += bw + 1 + Math.floor(rnd() * 3)
  }
  ctx.restore()
}

function qrBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rnd: () => number, color: string) {
  const n = 13
  const m = size / n
  ctx.save()
  ctx.fillStyle = color
  const inFinder = (i: number, j: number) =>
    (i < 4 && j < 4) || (i > n - 5 && j < 4) || (i < 4 && j > n - 5)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (inFinder(i, j)) continue
      if (rnd() > 0.52) ctx.fillRect(x + i * m, y + j * m, m + 0.5, m + 0.5)
    }
  }
  const finders: Array<[number, number]> = [[0, 0], [n - 4, 0], [0, n - 4]]
  for (const [fi, fj] of finders) {
    ctx.lineWidth = m
    ctx.strokeStyle = color
    ctx.strokeRect(x + (fi + 0.5) * m, y + (fj + 0.5) * m, 3 * m, 3 * m)
    ctx.fillRect(x + (fi + 1.25) * m, y + (fj + 1.25) * m, 1.5 * m, 1.5 * m)
  }
  ctx.restore()
}

function hazard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colorA: string, colorB: string) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = colorA
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = colorB
  const step = 14
  for (let i = -h; i < w + h; i += step * 2) {
    ctx.beginPath()
    ctx.moveTo(x + i, y + h)
    ctx.lineTo(x + i + step, y + h)
    ctx.lineTo(x + i + step + h, y)
    ctx.lineTo(x + i + h, y)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, fill: string, ink: string, size = 22) {
  ctx.save()
  ctx.font = `800 ${size}px ${DISPLAY}`
  const w = ctx.measureText(text).width + size * 1.6
  const h = size * 1.9
  const r = h / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(x + r, y + h)
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2)
  ctx.closePath()
  ctx.shadowColor = fill
  ctx.shadowBlur = 22
  ctx.fillStyle = fill
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = ink
  ctx.fillText(text, x + size * 0.8, y + h / 2 + size * 0.36)
  ctx.restore()
  return { w, h }
}

/* the common board chrome — glass, ticks, header, footer */
function frame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  label: string,
  kana: string,
  primary: string,
  accent: string,
  rnd: () => number,
  index: number,
) {
  const W = CELL
  // huge faint kana watermark behind everything
  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.fillStyle = primary
  ctx.font = `900 320px ${JP}`
  ctx.textAlign = 'right'
  ctx.fillText(kana.slice(0, 1), ox + W - 10, oy + W - 46)
  ctx.restore()
  // glass body + sheen
  ctx.fillStyle = 'rgba(9,12,22,0.5)'
  ctx.fillRect(ox, oy, W, W)
  const sheen = ctx.createLinearGradient(ox, oy, ox, oy + W)
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)')
  sheen.addColorStop(0.3, 'rgba(255,255,255,0.012)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.12)')
  ctx.fillStyle = sheen
  ctx.fillRect(ox, oy, W, W)
  // border + corner ticks
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 3
  ctx.strokeRect(ox + 5, oy + 5, W - 10, W - 10)
  ctx.strokeStyle = accent
  ctx.lineWidth = 5
  const t = 22
  const corners: Array<[number, number, number, number]> = [
    [ox + 5, oy + 5, 1, 1],
    [ox + W - 5, oy + 5, -1, 1],
    [ox + 5, oy + W - 5, 1, -1],
    [ox + W - 5, oy + W - 5, -1, -1],
  ]
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath()
    ctx.moveTo(cx + sx * t, cy)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx, cy + sy * t)
    ctx.stroke()
  }
  // header
  ctx.fillStyle = accent
  ctx.fillRect(ox + 24, oy + 24, 14, 14)
  ctx.font = `800 21px ${MONO}`
  ctx.fillStyle = WHITE
  ctx.fillText(label.toUpperCase(), ox + 50, oy + 38)
  ctx.font = `700 19px ${JP}`
  ctx.fillStyle = primary
  ctx.textAlign = 'right'
  ctx.fillText(kana, ox + W - 26, oy + 38)
  ctx.textAlign = 'left'
  ctx.fillStyle = primary
  ctx.globalAlpha = 0.65
  ctx.fillRect(ox + 24, oy + 52, W - 48, 2)
  ctx.globalAlpha = 1
  // footer
  ctx.font = `700 14px ${MONO}`
  ctx.fillStyle = 'rgba(255,255,255,0.42)'
  ctx.fillText(`SPAWN·PRISM // CELL ${String(index).padStart(2, '0')} // ${(rnd() * 65535 | 0).toString(16).toUpperCase().padStart(4, '0')}`, ox + 24, oy + W - 22)
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = window.setTimeout(() => resolve(null), 1600)
    img.onload = () => {
      window.clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    img.src = src
  })
}

export async function buildPanelAtlas(
  THREE: typeof ThreeNS,
  profile: Profile,
): Promise<PanelAtlas> {
  const cvs = document.createElement('canvas')
  cvs.width = COLS * CELL
  cvs.height = ROWS * CELL
  const ctx = cvs.getContext('2d')!

  const primary = profile.theme?.primary || CYAN
  const accent = profile.theme?.accent || AMBER
  const rnd = mulberry32(hashStr(profile.username || 'spawn'))

  const handle = '@' + (profile.username || 'spawn')
  const name = profile.displayName || handle
  const badges = (profile.badges ?? []).slice(0, 4)
  const stats = profile.stats ?? {}
  const links = (profile.links ?? []).slice(0, 5)
  const socials = (profile.socials ?? []).slice(0, 5)
  const np = profile.nowPlaying
  const avatar = profile.avatar ? await loadImage(profile.avatar) : null

  const fmtNum = (n?: number) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—')
  const fmtK = (n?: number) => {
    if (typeof n !== 'number') return '—'
    return n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString('en-US')
  }

  const at = (col: number, row: number) => [col * CELL, row * CELL] as const

  /* ---- cell 0: ID — the hero handle sign ---- */
  {
    const [ox, oy] = at(0, 0)
    frame(ctx, ox, oy, '// ID 01', KANA[0], primary, PINK, rnd, 0)
    const size = fitFont(ctx, handle, 800, CELL - 100, 96, DISPLAY)
    glowText(ctx, handle, ox + 28, oy + 190, size, WHITE, PINK, 800, DISPLAY, 30)
    // underline
    ctx.fillStyle = PINK
    ctx.fillRect(ox + 30, oy + 208, 220, 5)
    // status pill + node
    pill(ctx, ox + 30, oy + 250, (profile.status ?? 'online').toUpperCase(), RED, WHITE, 24)
    ctx.font = `700 20px ${MONO}`
    ctx.fillStyle = CYAN
    ctx.fillText(`NODE ${hashStr(profile.username).toString(16).slice(0, 8).toUpperCase()}`, ox + 230, oy + 283)
    barcode(ctx, ox + 30, oy + 340, CELL - 90, 52, rnd, 'rgba(255,255,255,0.7)')
    noiseDots(ctx, ox + 20, oy + 60, CELL - 40, CELL - 110, rnd, 40)
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 1: NAME — the big marquee ---- */
  {
    const [ox, oy] = at(1, 0)
    frame(ctx, ox, oy, '// NAME 02', KANA[1], primary, CYAN, rnd, 1)
    const size = fitFont(ctx, name.toUpperCase(), 800, CELL - 90, 104, DISPLAY)
    glowText(ctx, name.toUpperCase(), ox + 28, oy + 200, size, WHITE, CYAN, 800, DISPLAY, 34)
    // glitch echo
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = PINK
    ctx.font = `800 ${size}px ${DISPLAY}`
    ctx.fillText(name.toUpperCase(), ox + 34, oy + 194)
    ctx.restore()
    // kana + tagline
    ctx.font = `800 44px ${JP}`
    ctx.fillStyle = PINK
    ctx.fillText(`◆ ${name}`, ox + 30, oy + 280)
    ctx.font = `600 24px ${DISPLAY}`
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(truncate(ctx, profile.tagline || '—', CELL - 80), ox + 30, oy + 330)
    ctx.font = `700 20px ${MONO}`
    ctx.fillStyle = CYAN
    ctx.fillText(`EST.${stats.since ?? '—'} · ${(profile.socials ?? []).length}SOC · ${(profile.links ?? []).length}LINK`, ox + 30, oy + 388)
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 2: NOW PLAYING ---- */
  {
    const [ox, oy] = at(2, 0)
    frame(ctx, ox, oy, '// ON AIR 03', KANA[2], primary, AMBER, rnd, 2)
    if (np?.title) {
      pill(ctx, ox + 28, oy + 88, '● ON AIR', RED, WHITE, 26)
      const size = fitFont(ctx, np.title, 800, CELL - 110, 60, DISPLAY)
      glowText(ctx, truncate(ctx, np.title, CELL - 110), ox + 30, oy + 226, size, WHITE, AMBER, 800, DISPLAY, 26)
      ctx.font = `700 27px ${DISPLAY}`
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillText(truncate(ctx, np.artist || '—', CELL - 90), ox + 30, oy + 268)
      for (let i = 0; i < 26; i++) {
        const bh = 8 + Math.floor(rnd() * 58)
        ctx.fillStyle = i % 5 === 0 ? AMBER : (i % 3 === 0 ? PINK : CYAN)
        ctx.globalAlpha = 0.6 + rnd() * 0.4
        ctx.fillRect(ox + 28 + i * 17, oy + 366 - bh, 9, bh)
      }
      ctx.globalAlpha = 1
      const p = Math.max(0.05, Math.min(1, (np.progress ?? 42) / 100))
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fillRect(ox + 28, oy + 396, CELL - 90, 6)
      ctx.fillStyle = AMBER
      ctx.fillRect(ox + 28, oy + 396, (CELL - 90) * p, 6)
      ctx.font = `700 18px ${MONO}`
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fillText(`${Math.round((np.progress ?? 42) / 100 * 212)} / 212 · ${np.bpm ?? '—'} BPM`, ox + 28, oy + 436)
    } else {
      glowText(ctx, 'SIGNAL IDLE', ox + 30, oy + 210, 54, 'rgba(255,255,255,0.6)', CYAN, 800, DISPLAY, 18)
    }
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 3: STATUS / STATS — giant numbers ---- */
  {
    const [ox, oy] = at(3, 0)
    frame(ctx, ox, oy, '// STATUS 04', KANA[3], primary, VIOLET, rnd, 3)
    let cy = oy + 96
    for (const b of badges) {
      ctx.font = `800 19px ${MONO}`
      const tw = ctx.measureText(b.label.toUpperCase()).width + 28
      ctx.strokeStyle = b.tone === 'accent' ? AMBER : WHITE
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 2
      ctx.strokeRect(ox + 28, cy, tw, 36)
      ctx.globalAlpha = 1
      ctx.fillStyle = b.tone === 'accent' ? AMBER : WHITE
      ctx.fillText(b.label.toUpperCase(), ox + 42, cy + 25)
      cy += 44
    }
    const cols: Array<[string, string, string]> = [
      ['VIEWS', fmtK(stats.views), CYAN],
      ['LIKES', fmtNum(stats.likes), PINK],
      ['SINCE', stats.since ?? '—', WHITE],
    ]
    cols.forEach(([label, val, color], i) => {
      const y = oy + 300 + i * 70
      ctx.font = `700 19px ${MONO}`
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText(label, ox + 30, y - 18)
      glowText(ctx, val, ox + 30, y + 36, 52, color, color, 800, DISPLAY, 20)
    })
    ctx.font = `700 15px ${MONO}`
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(`TOTAL DISTRIBUTIONS · REV 1.0.${(rnd() * 40 | 0).toString().padStart(2, '0')}`, ox + 30, oy + 486)
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 4: LINKS ---- */
  {
    const [ox, oy] = at(0, 1)
    frame(ctx, ox, oy, '// LINKS 05', KANA[4], primary, CYAN, rnd, 4)
    links.forEach((l, i) => {
      const y = oy + 132 + i * 74
      ctx.font = `800 22px ${MONO}`
      ctx.fillStyle = CHONK[i % CHONK.length]
      ctx.fillText(String(i + 1).padStart(2, '0'), ox + 28, y)
      const size = fitFont(ctx, l.label.toUpperCase(), 800, CELL - 220, 34, DISPLAY)
      ctx.font = `800 ${size}px ${DISPLAY}`
      ctx.fillStyle = WHITE
      ctx.fillText(truncate(ctx, l.label.toUpperCase(), CELL - 220), ox + 84, y)
      ctx.font = `800 30px ${MONO}`
      ctx.textAlign = 'right'
      ctx.fillStyle = i === 0 ? AMBER : 'rgba(255,255,255,0.6)'
      ctx.fillText('↗', ox + CELL - 34, y)
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.fillRect(ox + 28, y + 18, CELL - 62, 2)
    })
    if (links.length === 0) {
      ctx.font = `800 26px ${MONO}`
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillText('NO LINKS', ox + 30, oy + 150)
    }
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 5: SOCIALS ---- */
  {
    const [ox, oy] = at(1, 1)
    frame(ctx, ox, oy, '// CONNECT 06', KANA[5], primary, PINK, rnd, 5)
    socials.forEach((s, i) => {
      const y = oy + 136 + i * 64
      ctx.fillStyle = CHONK[i % CHONK.length]
      ctx.beginPath()
      ctx.arc(ox + 44, y - 9, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = `800 30px ${DISPLAY}`
      ctx.fillStyle = WHITE
      ctx.fillText(s.platform.toUpperCase(), ox + 68, y)
      ctx.font = `600 21px ${MONO}`
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.textAlign = 'right'
      ctx.fillText(truncate(ctx, s.handle || '—', 190), ox + CELL - 32, y)
      ctx.textAlign = 'left'
    })
    if (socials.length === 0) {
      ctx.font = `800 26px ${MONO}`
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillText('NO SOCIALS', ox + 30, oy + 150)
    }
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 6: SYSTEM / QR ---- */
  {
    const [ox, oy] = at(2, 1)
    frame(ctx, ox, oy, '// SYSTEM 07', KANA[6], primary, AMBER, rnd, 6)
    qrBlock(ctx, ox + 30, oy + 92, 168, rnd, WHITE)
    ctx.font = `800 30px ${DISPLAY}`
    ctx.fillStyle = AMBER
    ctx.fillText('SCAN TO SPAWN', ox + 226, oy + 136)
    ctx.font = `700 21px ${MONO}`
    ctx.fillStyle = WHITE
    ctx.fillText(`/p/${profile.username}`, ox + 226, oy + 174)
    barcode(ctx, ox + 226, oy + 200, CELL - 262, 40, rnd, 'rgba(255,255,255,0.65)')
    hazard(ctx, ox + 30, oy + 300, CELL - 60, 44, AMBER, 'rgba(0,0,0,0.88)')
    ctx.font = `800 20px ${MONO}`
    ctx.fillStyle = '#000'
    ctx.fillText('// BUILDING CITY', ox + 52, oy + 330)
    noiseDots(ctx, ox + 20, oy + 60, CELL - 40, CELL - 110, rnd, 40)
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 7: AVATAR ---- */
  {
    const [ox, oy] = at(3, 1)
    frame(ctx, ox, oy, '// ID PHOTO 08', KANA[7], primary, VIOLET, rnd, 7)
    const bx = ox + 84
    const by = oy + 92
    const bs = 336
    if (avatar) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(bx, by, bs, bs)
      ctx.clip()
      const scale = Math.max(bs / avatar.width, bs / avatar.height)
      const dw = avatar.width * scale
      const dh = avatar.height * scale
      ctx.drawImage(avatar, bx + (bs - dw) / 2, by + (bs - dh) / 2, dw, dh)
      ctx.globalAlpha = 0.18
      ctx.fillStyle = VIOLET
      ctx.fillRect(bx, by, bs, bs)
      ctx.globalAlpha = 1
      ctx.restore()
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(bx, by, bs, bs)
      const initials = name.slice(0, 2).toUpperCase()
      const size = fitFont(ctx, initials, 800, bs - 60, 160, DISPLAY)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = `800 ${size}px ${DISPLAY}`
      ctx.textAlign = 'center'
      ctx.fillText(initials, bx + bs / 2, by + bs / 2 + size * 0.34)
      ctx.textAlign = 'left'
    }
    // glitch echo frame
    ctx.strokeStyle = PINK
    ctx.lineWidth = 4
    ctx.globalAlpha = 0.8
    ctx.strokeRect(bx - 5, by - 5, bs + 10, bs + 10)
    ctx.strokeStyle = WHITE
    ctx.globalAlpha = 0.9
    ctx.strokeRect(bx - 12, by - 12, bs + 24, bs + 24)
    ctx.globalAlpha = 1
    scanlines(ctx, bx, by, bs, bs, 0.08)
    ctx.font = `700 16px ${MONO}`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText('RGB // 15-BIT DITHER // LIVE FEED', ox + 30, oy + 470)
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cells 8..11: one board per link (the links live in the district) ---- */
  for (let li = 0; li < 4; li++) {
    const [ox, oy] = at(li, 2)
    frame(ctx, ox, oy, `// LINK 0${li + 1}`, KANA[4], primary, AMBER, rnd, 8 + li)
    const link = links[li]
    if (link) {
      const size = fitFont(ctx, link.label.toUpperCase(), 800, CELL - 190, 64, DISPLAY)
      glowText(ctx, truncate(ctx, link.label.toUpperCase(), CELL - 190), ox + 28, oy + 196, size, WHITE, CHONK[li % CHONK.length], 800, DISPLAY, 30)
      let domain = link.url
      try {
        domain = new URL(link.url).hostname.replace(/^www\./, '')
      } catch {
        // keep the raw value when the URL is irregular
      }
      ctx.font = `700 23px ${MONO}`
      ctx.fillStyle = CYAN
      ctx.fillText(truncate(ctx, domain, CELL - 170), ox + 30, oy + 242)
      ctx.font = `800 20px ${MONO}`
      ctx.fillStyle = AMBER
      ctx.fillText('TAP / CLICK TO OPEN', ox + 30, oy + 306)
      ctx.font = `800 74px ${DISPLAY}`
      ctx.textAlign = 'right'
      ctx.fillStyle = WHITE
      ctx.fillText('↗', ox + CELL - 34, oy + 200)
      ctx.textAlign = 'left'
      hazard(ctx, ox + 30, oy + 340, CELL - 60, 26, AMBER, 'rgba(0,0,0,0.88)')
    } else {
      ctx.font = `800 28px ${MONO}`
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillText('NO LINK', ox + 30, oy + 180)
    }
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 12: the mascot ---- */
  {
    const [ox, oy] = at(0, 3)
    const cx = ox + CELL / 2
    const cy = oy + CELL / 2 - 26
    const aura = ctx.createRadialGradient(cx, cy, 20, cx, cy, 250)
    aura.addColorStop(0, 'rgba(255,255,255,0.34)')
    aura.addColorStop(0.4, 'rgba(255,120,200,0.14)')
    aura.addColorStop(1, 'rgba(255,47,109,0)')
    ctx.fillStyle = aura
    ctx.fillRect(ox, oy, CELL, CELL)
    // plump heart-cat body
    ctx.save()
    ctx.shadowColor = 'rgba(255,255,255,0.95)'
    ctx.shadowBlur = 52
    ctx.fillStyle = WHITE
    ctx.beginPath()
    ctx.moveTo(cx, cy - 118)
    ctx.bezierCurveTo(cx - 40, cy - 196, cx - 172, cy - 132, cx - 150, cy - 18)
    ctx.bezierCurveTo(cx - 134, cy + 78, cx - 62, cy + 122, cx, cy + 172)
    ctx.bezierCurveTo(cx + 62, cy + 122, cx + 134, cy + 78, cx + 150, cy - 18)
    ctx.bezierCurveTo(cx + 172, cy - 132, cx + 40, cy - 196, cx, cy - 118)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    // eyes
    ctx.fillStyle = '#10131f'
    ctx.beginPath()
    ctx.ellipse(cx - 48, cy - 24, 16, 28, 0, 0, Math.PI * 2)
    ctx.ellipse(cx + 48, cy - 24, 16, 28, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath()
    ctx.arc(cx - 42, cy - 36, 6, 0, Math.PI * 2)
    ctx.arc(cx + 54, cy - 36, 6, 0, Math.PI * 2)
    ctx.fill()
    // blush
    ctx.fillStyle = 'rgba(255,47,109,0.35)'
    ctx.beginPath()
    ctx.ellipse(cx - 110, cy + 30, 27, 15, 0, 0, Math.PI * 2)
    ctx.ellipse(cx + 110, cy + 30, 27, 15, 0, 0, Math.PI * 2)
    ctx.fill()
    // sparkles
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    const star = (sx: number, sy: number, r: number) => {
      ctx.fillRect(sx - r * 2.4, sy - 1, r * 4.8, 2)
      ctx.fillRect(sx - 1, sy - r * 2.4, 2, r * 4.8)
    }
    star(ox + 74, oy + 96, 5)
    star(ox + 434, oy + 130, 4)
    star(ox + 96, oy + 424, 4)
    ctx.font = `800 24px ${JP}`
    ctx.fillStyle = PINK
    ctx.textAlign = 'center'
    ctx.fillText('ともだち', cx, oy + 486)
    ctx.textAlign = 'left'
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 13: vertical kana sign ---- */
  {
    const [ox, oy] = at(1, 3)
    ctx.fillStyle = 'rgba(28,8,14,0.95)'
    ctx.fillRect(ox + 34, oy, CELL - 68, CELL)
    ctx.strokeStyle = WHITE
    ctx.lineWidth = 5
    ctx.strokeRect(ox + 44, oy + 10, CELL - 88, CELL - 20)
    ctx.strokeStyle = 'rgba(255,69,73,0.9)'
    ctx.lineWidth = 2
    ctx.strokeRect(ox + 56, oy + 22, CELL - 112, CELL - 44)
    // lamp
    ctx.save()
    ctx.shadowColor = RED
    ctx.shadowBlur = 40
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.arc(ox + CELL / 2, oy + 68, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // kana stacked
    const chars = 'オンライン'
    ctx.textAlign = 'center'
    chars.split('').forEach((ch, i) => {
      glowText(ctx, ch, ox + CELL / 2, oy + 168 + i * 68, 56, WHITE, RED, 900, JP, 18)
    })
    ctx.font = `800 30px ${MONO}`
    ctx.fillStyle = AMBER
    ctx.fillText('24H', ox + CELL / 2, oy + 486)
    ctx.textAlign = 'left'
    noiseDots(ctx, ox + 40, oy + 30, CELL - 80, CELL - 60, rnd, 40)
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 14: hazard board ---- */
  {
    const [ox, oy] = at(2, 3)
    ctx.fillStyle = '#0a0a0d'
    ctx.fillRect(ox, oy, CELL, CELL)
    hazard(ctx, ox, oy, CELL, 74, AMBER, '#0a0a0d')
    hazard(ctx, ox, oy + CELL - 74, CELL, 74, AMBER, '#0a0a0d')
    ctx.save()
    ctx.shadowColor = AMBER
    ctx.shadowBlur = 44
    ctx.fillStyle = AMBER
    ctx.font = `900 148px ${JP}`
    ctx.textAlign = 'center'
    ctx.fillText('注意', ox + CELL / 2, oy + 300)
    ctx.restore()
    ctx.textAlign = 'center'
    ctx.font = `800 22px ${MONO}`
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText('CAUTION // WATCH THE SIGNS', ox + CELL / 2, oy + 356)
    ctx.save()
    ctx.shadowColor = RED
    ctx.shadowBlur = 30
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.arc(ox + CELL / 2, oy + 128, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.textAlign = 'left'
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  /* ---- cell 15: data wall ---- */
  {
    const [ox, oy] = at(3, 3)
    frame(ctx, ox, oy, '// SYSTEM LOG', 'ログ', CYAN, PINK, rnd, 15)
    let y = oy + 104
    for (let i = 0; i < 12; i++) {
      const n = 5 + Math.floor(rnd() * 4)
      let line = ''
      for (let k = 0; k < n; k++) line += (rnd() * 65535 | 0).toString(16).padStart(4, '0') + ' '
      ctx.font = `700 15px ${MONO}`
      ctx.fillStyle = i % 4 === 0 ? CYAN : 'rgba(255,255,255,0.5)'
      ctx.fillText(line, ox + 26, y)
      if (rnd() > 0.55) {
        ctx.fillStyle = PINK
        ctx.fillRect(ox + 24, y - 11, 4, 14)
      }
      y += 30
    }
    // mini chart
    for (let i = 0; i < 22; i++) {
      const bh = 8 + Math.floor(rnd() * 60)
      ctx.fillStyle = i % 4 === 0 ? PINK : (i % 3 === 0 ? AMBER : CYAN)
      ctx.globalAlpha = 0.6 + rnd() * 0.4
      ctx.fillRect(ox + 26 + i * 21, oy + 486 - bh, 10, bh)
    }
    ctx.globalAlpha = 1
    scanlines(ctx, ox, oy, CELL, CELL)
  }

  const texture = new THREE.CanvasTexture(cvs)
  texture.anisotropy = 8
  texture.colorSpace = THREE.SRGBColorSpace

  const cells: PanelAtlas['cells'] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      cells.push({
        min: [col / COLS + PAD_U * 0.25, 1 - (row + 1) / ROWS + PAD_V * 0.25],
        max: [(col + 1) / COLS - PAD_U * 0.25, 1 - row / ROWS - PAD_V * 0.25],
      })
    }
  }

  return { texture, cells }
}
