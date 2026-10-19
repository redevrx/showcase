<script setup lang="ts">
import type { Profile } from '~/types/profile'

const props = defineProps<{ profile: Profile, progressSelector?: string }>()
const emit = defineEmits<{ ready: [], failed: [] }>()

let canvasEl: HTMLCanvasElement | null = null
let handle: { start: () => void, destroy: () => void } | null = null
let live = true

async function boot() {
  if (!live || !canvasEl || handle) return

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const gate = document.documentElement.dataset.entrance
  const quick = gate === 'quick' || gate === 'done'

  try {
    const { createSkylineScene } = await import('../lib/skyline/world')
    if (!live || !canvasEl) return
    handle = await createSkylineScene({
      canvas: canvasEl,
      profile: props.profile,
      reduced,
      quick,
      progressSelector: props.progressSelector,
    })
    if (!live) {
      handle.destroy()
      handle = null
      return
    }
    handle.start()
    emit('ready')
  } catch (err) {
    console.warn('[skyline] canvas host failed', err)
    emit('failed')
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
  <canvas :ref="setCanvas" class="skyline-canvas" aria-hidden="true" />
</template>
