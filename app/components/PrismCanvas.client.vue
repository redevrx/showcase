<script setup lang="ts">
import type { Profile } from '~/types/profile'

const props = defineProps<{ profile: Profile }>()

let canvasEl: HTMLCanvasElement | null = null
let handle: { start: () => Promise<void>, destroy: () => void } | null = null
let live = true

async function boot() {
  if (!live || !canvasEl || handle) return

  // The pre-paint gate script owns the entrance state — read it here so the
  // scene never depends on parent/child mount order.
  const gate = document.documentElement.dataset.entrance
  const reduced = gate === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const quick = gate === 'quick' || gate === 'done'

  try {
    const { createPrismScene } = await import('../lib/prism/scene')
    if (!live || !canvasEl) return
    handle = createPrismScene({ canvas: canvasEl, profile: props.profile, reduced, quick })
    await handle.start()
  } catch (err) {
    console.warn('[prism] canvas host failed', err)
  }
}

function setCanvas(el: unknown) {
  canvasEl = el instanceof HTMLCanvasElement ? el : null
  if (canvasEl) boot()
}

onBeforeUnmount(() => {
  live = false
  handle?.destroy()
  handle = null
  canvasEl = null
})
</script>

<template>
  <canvas :ref="setCanvas" class="prism-canvas" aria-hidden="true" />
</template>
