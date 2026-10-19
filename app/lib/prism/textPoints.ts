// Samples the display name into a 3D point cloud by drawing it to a 2D canvas
// and picking the opaque pixels. Works with any loaded webfont (Thai included).
// Falls back to a procedural ring when canvas sampling is unavailable.

export interface TextSample {
  positions: Float32Array // xyz triplets, centred on the origin, world units
  width: number
  height: number
  fallback: boolean
}

const W = 1024
const H = 288
const WORLD_WIDTH = 9.4 // a full-width name spans this many world units

export async function sampleTextPoints(text: string, maxPoints = 4600): Promise<TextSample> {
  const clean = (text || 'PLAYER').trim().slice(0, 22)

  try {
    if (typeof document === 'undefined') throw new Error('no document')
    if (document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise(resolve => setTimeout(resolve, 1500)),
      ])
    }

    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('no 2d context')

    const font = (size: number) => `700 ${size}px 'Chakra Petch', ui-sans-serif, sans-serif`

    let size = 172
    ctx.font = font(size)
    const natural = ctx.measureText(clean).width
    if (natural > W * 0.9) size = Math.max(64, Math.floor(size * (W * 0.9) / natural))

    ctx.font = font(size)
    const drawn = Math.max(ctx.measureText(clean).width, 1)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(clean, W / 2, H / 2 + size * 0.03)

    const data = ctx.getImageData(0, 0, W, H).data
    const alphaAt = (x: number, y: number) => data[(y * W + x) * 4 + 3]

    // Measure how much of the canvas the glyphs actually cover (stride 2),
    // then pick the sampling step that lands closest to the point budget.
    let hits = 0
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        if (alphaAt(x, y) >= 140) hits++
      }
    }
    const covered = Math.max(hits * 4, 1)
    const target = Math.min(maxPoints, Math.max(1400, Math.round(drawn * 4.2)))
    const step = Math.min(12, Math.max(2, Math.round(Math.sqrt(covered / target))))

    const scale = WORLD_WIDTH / (W * 0.9)
    const out: number[] = []
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        if (alphaAt(x, y) < 140) continue
        out.push(
          (x - W / 2) * scale + (Math.random() - 0.5) * 0.05,
          -(y - H / 2) * scale * 0.94 + (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.85,
        )
      }
    }
    if (out.length < 500) throw new Error('too few points')

    return {
      positions: new Float32Array(out),
      width: drawn * scale,
      height: size * scale,
      fallback: false,
    }
  } catch {
    return ringFallback()
  }
}

function ringFallback(): TextSample {
  const n = 2600
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 3.6 + Math.sin(i * 0.61) * 0.55
    positions[i * 3] = Math.cos(a) * r
    positions[i * 3 + 1] = Math.sin(a) * 1.15 + 0.4
    positions[i * 3 + 2] = Math.sin(i * 0.37) * 1.4 - 0.6
  }
  return { positions, width: 7.4, height: 2.4, fallback: true }
}
