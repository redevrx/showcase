// SKYLINE — the world.
// Renderer, bloom composer, adaptive quality tiers and the flight loop.
// Scroll moves the camera along the rail; the beat warp slows it around the
// story moments and the beat focus swings the look toward each landmark.

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Profile } from '~/types/profile'
import { buildBeats, type Beat } from './beats'
import { createRail, PAD } from './rail'
import { buildCity } from './generator'
import { createProps } from './props'
import { createLandmarks, type LandmarkHandle } from './landmarks'
import { seedFrom } from './kit'

export interface SkylineSceneOptions {
  canvas: HTMLCanvasElement
  profile: Profile
  reduced?: boolean
  quick?: boolean
  /** element whose height defines the full flight (defaults to the document) */
  progressSelector?: string
}

export interface SkylineSceneHandle {
  start(): void
  destroy(): void
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function dprFor(tier: number) {
  const base = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  if (tier === 0) return Math.min(base, 2)
  if (tier === 1) return Math.min(base, 1.5)
  return 1
}

async function fontsReady(ms = 900) {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (!fonts) return
    await Promise.race([
      Promise.all([
        fonts.load('700 40px "Chakra Petch"'),
        fonts.load('600 40px "Chakra Petch"'),
        fonts.load('500 40px "Anuphan"'),
      ]).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
    ])
  } catch {
    // fonts are a nice-to-have; fall back to the system stack
  }
}

export async function createSkylineScene(opts: SkylineSceneOptions): Promise<SkylineSceneHandle> {
  const { canvas, profile } = opts
  const reduced = !!opts.reduced
  const seed = seedFrom(profile.username)

  const mobile = (navigator.maxTouchPoints ?? 0) > 1 || /Mobi|Android/i.test(navigator.userAgent)
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  let tier = reduced ? 2 : (mobile || cores <= 4 || mem <= 4) ? 2 : (cores >= 8 ? 0 : 1)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.setClearColor(0x02030a, 1)
  renderer.setPixelRatio(dprFor(tier))
  let w = window.innerWidth
  let h = window.innerHeight
  renderer.setSize(w, h, false)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x02030a)
  scene.fog = new THREE.FogExp2(0x02030a, 0.0014)

  const camera = new THREE.PerspectiveCamera(50, w / h, 0.4, 2600)

  /* ------------------------------------------------------------- content ---- */

  const beats: Beat[] = buildBeats({
    stats: !!profile.stats,
    links: (profile.links?.length ?? 0) > 0,
    music: !!profile.nowPlaying,
    socials: (profile.socials?.length ?? 0) > 0,
  })
  const rail = createRail(beats)

  const city = buildCity({
    seed,
    rail,
    windowBudget: tier === 0 ? 24000 : tier === 1 ? 14000 : 7000,
    far: true,
    windows: true,
  })
  scene.add(city.group)

  const props = tier === 2 ? null : createProps({ rail, seed, tier })
  if (props) scene.add(props.group)

  await fontsReady()

  const shareUrl = `${location.origin}/p/${profile.username}`
  const marks: LandmarkHandle = await createLandmarks({
    profile,
    slots: city.slots,
    towers: city.towers,
    rail,
    shareUrl,
    tier,
    aspect: w / h,
  })
  scene.add(marks.group)

  // dev-only probe: lets the console map landmarks against the camera
  const debug = import.meta.dev
    ? ((window as Window & { __sky?: Record<string, unknown> }).__sky = {
        foci: marks.foci,
        camera,
        rail,
        towers: city.towers,
        arc: 0,
        p: 0,
        frames: 0,
        get tier() {
          return tier
        },
      })
    : null

  /* ------------------------------------------------------------ composer ---- */

  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(dprFor(tier))
  composer.setSize(w, h)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), tier === 0 ? 0.42 : 0.34, 0.6, 0.85)
  if (reduced) bloom.strength *= 0.6
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  /* --------------------------------------------------------------- state ---- */

  let disposed = false
  let raf = 0
  let last = performance.now()
  let time = 0
  let progress = -1
  let roll = 0
  let frames = 0
  let slowFrames = 0

  const pointer = { x: 0, y: 0 }
  const pointerSmooth = { x: 0, y: 0 }
  let hoverCheck = 0
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hitList = marks.interactive.map((i) => i.obj)

  const tmpPos = new THREE.Vector3()
  const tmpDir = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const scratchDir = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()

  function progressAt(): number {
    const el = opts.progressSelector ? document.querySelector<HTMLElement>(opts.progressSelector) : null
    if (el && el.offsetHeight > 0) return clamp(window.scrollY / el.offsetHeight, 0, 1)
    const max = document.documentElement.scrollHeight - window.innerHeight
    return max > 0 ? clamp(window.scrollY / max, 0, 1) : 0
  }

  /** nearest beat to p, with a soft 0..1 blend amount */
  function focusAt(p: number): { beat: Beat, amount: number } | null {
    let best: Beat | null = null
    let bestD = Infinity
    for (const b of beats) {
      const d = Math.abs(p - b.t)
      if (d < bestD) {
        bestD = d
        best = b
      }
    }
    if (!best) return null
    const range = 0.05 + best.dwell * 0.035
    if (bestD > range) return null
    const amount = 1 - bestD / range
    return { beat: best, amount: amount * amount * (3 - 2 * amount) }
  }

  function applyTier() {
    renderer.setPixelRatio(dprFor(tier))
    composer.setPixelRatio(dprFor(tier))
    if (tier >= 2 && !reduced) bloom.strength = 0.3
    if (tier >= 2 && props) {
      scene.remove(props.group)
      props.dispose()
    }
  }

  /* --------------------------------------------------------------- events ---- */

  function onResize() {
    w = window.innerWidth
    h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
  }

  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (!raf && !disposed) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }

  function onPointerMove(e: PointerEvent) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
    if (performance.now() - hoverCheck > 140) {
      hoverCheck = performance.now()
      ndc.set(pointer.x, pointer.y)
      raycaster.setFromCamera(ndc, camera)
      const hit = hitList.length ? raycaster.intersectObjects(hitList, false)[0] : undefined
      canvas.style.cursor = hit ? 'pointer' : ''
    }
  }

  let downX = 0
  let downY = 0
  function onPointerDown(e: PointerEvent) {
    downX = e.clientX
    downY = e.clientY
  }

  function onPointerUp(e: PointerEvent) {
    if (Math.abs(e.clientX - downX) > 7 || Math.abs(e.clientY - downY) > 7) return
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1))
    raycaster.setFromCamera(ndc, camera)
    const hits = hitList.length ? raycaster.intersectObjects(hitList, false) : []
    const hit = hits[0]
    if (!hit) return
    const item = marks.interactive.find((i) => i.obj === hit.object)
    if (item) window.open(item.url, '_blank', 'noopener')
  }

  /* ----------------------------------------------------------------- loop ---- */

  function frame(now: number) {
    if (disposed) return
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    time += dt

    const pRaw = progressAt()
    if (progress < 0) progress = pRaw
    progress += (pRaw - progress) * Math.min(1, dt * 7)

    const p = clamp(progress, 0, 1)
    const arc = rail.warp.warp(p) * rail.length
    rail.sample(arc, tmpPos, tmpDir)
    if (tmpDir.lengthSq() < 1e-6) tmpDir.set(0, 0, -1).normalize()
    if (debug) {
      debug.arc = arc / rail.length
      debug.p = p
      debug.cam = tmpPos.toArray()
    }

    const rate = rail.warp.rate(p)
    const la = 18 + rate * 22
    const aheadArc = arc + la
    if (aheadArc < rail.length) rail.sample(aheadArc, lookTarget, scratchDir)
    else lookTarget.copy(tmpPos).addScaledVector(tmpDir, la)

    const focus = focusAt(p)
    if (focus) {
      const pos = marks.foci.get(focus.beat.id)
      if (pos) {
        const gate = focus.beat.id === 'gate'
        // only swing toward a landmark that is ahead of the camera — never
        // turn into the wall we are flying past. The gate is the destination,
        // so it may pull the look down even while the rail climbs steeply.
        scratchDir.copy(pos).sub(tmpPos).normalize()
        const facing = scratchDir.dot(tmpDir)
        const w = gate ? focus.amount * 0.9 : focus.amount * 0.8 * clamp((facing - 0.15) / 0.6, 0, 1)
        lookTarget.lerp(pos, w)
      }
    }

    // soften the dive and the rooftop climb: keep the horizon — and the pad —
    // in frame instead of staring straight up or down the spline
    const damp = tmpDir.y > 0.15 ? 0.55 : 0.78
    lookTarget.y = tmpPos.y + (lookTarget.y - tmpPos.y) * damp

    camera.position.copy(tmpPos)
    camera.up.set(0, 1, 0)
    camera.lookAt(lookTarget)

    // bank into the turns
    const bankArc = arc + 14
    if (bankArc < rail.length) rail.sample(bankArc, ahead, scratchDir)
    else ahead.copy(tmpPos).addScaledVector(tmpDir, 14)
    const cross = tmpDir.x * ahead.z - tmpDir.z * ahead.x
    roll += (clamp(-cross * 7, -0.17, 0.17) - roll) * Math.min(1, dt * 1.8)
    camera.rotateZ(roll)

    // pointer parallax (never under reduced motion)
    if (!reduced && tier < 2) {
      pointerSmooth.x += (pointer.x - pointerSmooth.x) * Math.min(1, dt * 3)
      pointerSmooth.y += (pointer.y - pointerSmooth.y) * Math.min(1, dt * 3)
      camera.rotateY(pointerSmooth.x * 0.02)
      camera.rotateX(pointerSmooth.y * 0.012)
    }

    if (!reduced) marks.update(time)

    composer.render()
    if (debug) debug.frames = (debug.frames as number) + 1

    // adaptive quality: watch the frame time, step down once it hurts
    frames++
    if (frames > 45) {
      const frameMs = dt * 1000
      if (frameMs > 27 && tier < 2) {
        slowFrames++
        if (slowFrames > 40) {
          slowFrames = 0
          tier++
          applyTier()
        }
      } else {
        slowFrames = Math.max(0, slowFrames - 1)
      }
      frames = 0
    }
  }

  return {
    start() {
      document.documentElement.classList.add('has-gl')
      window.addEventListener('resize', onResize)
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('pointerdown', onPointerDown, { passive: true })
      window.addEventListener('pointerup', onPointerUp, { passive: true })
      document.documentElement.dataset.skyline = 'live'
      last = performance.now()
      raf = requestAnimationFrame(frame)
    },
    destroy() {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      document.documentElement.classList.remove('has-gl')
      delete document.documentElement.dataset.skyline
      bloom.dispose()
      composer.dispose()
      city.dispose()
      props?.dispose()
      marks.dispose()
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}

export { PAD }
