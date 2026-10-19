<script setup lang="ts">
import type { Profile } from '~/types/profile'
import { emitSpawn, onSpawn } from '~/lib/bus'

const props = defineProps<{ profile: Profile }>()

type Phase = 'boot' | 'assemble' | 'land' | 'live'

const phase = ref<Phase>('boot')
const progress = ref(0.02)
const label = ref('SIGNAL')

const line = computed(() => {
  switch (phase.value) {
    case 'boot':
      return 'CALIBRATING SIGNAL'
    case 'assemble':
      return `ASSEMBLING @${props.profile.username}`
    case 'land':
      return 'LOCKING ORBIT'
    default:
      return 'SIGNAL READY'
  }
})

const pct = computed(() => Math.round(progress.value * 100))

let off: (() => void) | null = null

onMounted(() => {
  off = onSpawn((e) => {
    if (e.type === 'progress') {
      progress.value = Math.max(progress.value, e.v)
      label.value = e.label
    } else if (e.type === 'phase') {
      phase.value = e.phase
      if (e.label) label.value = e.label
    }
  })
})

onBeforeUnmount(() => off?.())

function skip() {
  emitSpawn({ type: 'skip' })
}
</script>

<template>
  <div class="prism-intro" aria-hidden="true">
    <p class="prism-intro__brand">PRISM · v1</p>

    <div class="prism-intro__overture">
      <Transition name="pz-swap" mode="out-in">
        <p :key="line" class="prism-intro__line">{{ line }}</p>
      </Transition>
    </div>

    <div class="prism-intro__meter">
      <span class="prism-intro__label">{{ label }}</span>
      <span class="prism-intro__track"><i class="prism-intro__fill" :style="{ width: `${pct}%` }" /></span>
      <span class="prism-intro__pct">{{ pct }}%</span>
    </div>

    <button class="prism-intro__skip" type="button" @click="skip">ข้าม · SKIP</button>
  </div>
</template>
