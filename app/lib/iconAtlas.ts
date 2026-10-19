import type * as ThreeNS from 'three'
import { ICON_PATHS, resolveIcon } from './icon-data'

// One canvas atlas holds every social icon as a white alpha mask.
// Cell order = Object.keys(ICON_PATHS) + a procedural 'link' fallback = 16 cells (4x4).
export const ATLAS_ORDER: string[] = [...Object.keys(ICON_PATHS), 'link']
export const ATLAS_COLS = 4
export const ATLAS_ROWS = Math.ceil(ATLAS_ORDER.length / ATLAS_COLS)

const CELL = 128
const PAD = CELL * 0.16

export interface IconAtlas {
  texture: ThreeNS.CanvasTexture
  cols: number
  rows: number
  index: (name?: string | null) => number
}

export function buildIconAtlas(THREE: typeof ThreeNS): IconAtlas {
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_COLS * CELL
  canvas.height = ATLAS_ROWS * CELL
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  ATLAS_ORDER.forEach((key, i) => {
    const col = i % ATLAS_COLS
    const rowFromBottom = Math.floor(i / ATLAS_COLS)
    // CanvasTexture keeps flipY=true, so row 0 of the atlas must be the BOTTOM canvas row.
    const x = col * CELL + PAD
    const y = (ATLAS_ROWS - 1 - rowFromBottom) * CELL + PAD
    const scale = (CELL - PAD * 2) / 24

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.4
    if (key === 'link') {
      ctx.beginPath()
      ctx.arc(12, 12, 7.2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(12, 12, 2.6, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const path = ICON_PATHS[key]
      if (path) ctx.fill(new Path2D(path))
    }
    ctx.restore()
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true

  return {
    texture,
    cols: ATLAS_COLS,
    rows: ATLAS_ROWS,
    index: (name?: string | null) => {
      const key = resolveIcon(name)
      const i = ATLAS_ORDER.indexOf(key)
      return i >= 0 ? i : ATLAS_ORDER.length - 1
    },
  }
}
