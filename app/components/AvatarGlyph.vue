<script setup lang="ts">
import { useId } from 'vue'

const props = withDefaults(defineProps<{
  src?: string
  name: string
  size?: number
}>(), { size: 104 })

const uid = useId()
const gradId = `av-grad-${uid}`
const noiseId = `av-noise-${uid}`

const failed = ref(false)
const initials = computed(() => {
  const clean = props.name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim()
  const first = clean.split(/\s+/)[0] ?? '?'
  return first.slice(0, 2).toUpperCase()
})
</script>

<template>
  <span class="avatar" :style="{ '--avatar-size': `${size}px` }">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="name"
      loading="eager"
      decoding="async"
      @error="failed = true"
    >
    <svg v-else class="avatar__glyph" viewBox="0 0 104 104" role="img" :aria-label="name">
      <defs>
        <linearGradient :id="gradId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="var(--primary, #CFE6FF)" stop-opacity="0.85" />
          <stop offset="1" stop-color="var(--accent, #FFB65C)" stop-opacity="0.65" />
        </linearGradient>
        <filter :id="noiseId">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.85  0 0 0 0 0.92  0 0 0 0 1  0.6 0.6 0.6 0 0"
          />
        </filter>
      </defs>
      <circle cx="52" cy="52" r="52" fill="#0B1018" />
      <circle cx="52" cy="52" r="52" :fill="`url(#${gradId})`" opacity="0.28" />
      <circle cx="52" cy="52" r="52" :filter="`url(#${noiseId})`" opacity="0.16" />
      <text
        x="52"
        y="54"
        text-anchor="middle"
        dominant-baseline="central"
        class="avatar__initials"
      >{{ initials }}</text>
    </svg>
  </span>
</template>

<style scoped>
.avatar {
  display: block;
  width: var(--avatar-size);
  height: var(--avatar-size);
  border-radius: 50%;
  overflow: hidden;
  background: #0b1018;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar__glyph {
  width: 100%;
  height: 100%;
  display: block;
}

.avatar__initials {
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: 0.04em;
  fill: rgba(231, 238, 249, 0.92);
}
</style>
