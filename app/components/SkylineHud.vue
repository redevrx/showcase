<script setup lang="ts">
import type { Profile } from '~/types/profile'
import { buildWarp, type Beat } from '~/lib/skyline/beats'

const props = defineProps<{ profile: Profile, beats: Beat[] }>()

const active = ref(0)
const pct = ref('0%')
const past = ref(false)
const scrolled = ref(false)
const warp = buildWarp(props.beats)

function spacer() {
  return document.querySelector<HTMLElement>('.skyline-scroll')
}

function update() {
  const el = spacer()
  const hgt = Math.max(1, el?.offsetHeight ?? 1)
  const p = Math.min(1, Math.max(0, window.scrollY / hgt))
  const arc = warp.warp(p)
  pct.value = `${(arc * 100).toFixed(1)}%`
  scrolled.value = p > 0.012
  past.value = window.scrollY > hgt * 0.985

  let best = 0
  let bestD = Infinity
  props.beats.forEach((b, i) => {
    const d = Math.abs(b.t - arc)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  active.value = best
}

function go(i: number) {
  const b = props.beats[i]
  if (!b) return
  const el = spacer()
  const hgt = Math.max(1, el?.offsetHeight ?? 1)
  const p = warp.invert(b.t)
  window.scrollTo({ top: p * hgt, behavior: 'smooth' })
}

onMounted(() => {
  update()
  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
  })
})
</script>

<template>
  <aside class="skyline-hud" :class="{ 'is-past': past }">
    <div class="hud-id">
      <img v-if="profile.avatar" class="hud-id__img" :src="profile.avatar" alt="" loading="lazy" />
      <div class="hud-id__meta">
        <strong>{{ profile.displayName }}</strong>
        <span>@{{ profile.username }}</span>
      </div>
      <span class="hud-id__dot" :data-status="profile.status" aria-hidden="true" />
    </div>

    <nav class="hud-rail" aria-label="เส้นทางการบิน" :style="{ '--p': pct }">
      <span class="hud-rail__track" aria-hidden="true"><i /></span>
      <button
        v-for="(b, i) in beats"
        :key="b.id"
        class="hud-rail__beat"
        :class="{ 'is-on': active === i }"
        type="button"
        :aria-label="`ไปจุด ${b.label}`"
        :aria-current="active === i ? 'step' : undefined"
        @click="go(i)"
      >
        <span class="hud-rail__dot" aria-hidden="true" />
        <span class="hud-rail__label">{{ b.label }}</span>
      </button>
    </nav>

    <p class="hud-hint" :class="{ 'is-off': scrolled }">
      สกรอลล์เพื่อบิน · คลิกป้ายในเมืองเพื่อเปิดลิงก์
    </p>
  </aside>
</template>
