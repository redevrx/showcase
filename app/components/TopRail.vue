<script setup lang="ts">
import type { Profile } from '~/types/profile'

const props = defineProps<{ profile: Profile }>()

const clock = ref('--:--:--')
let timer: ReturnType<typeof setInterval> | null = null

function tick() {
  clock.value = new Date().toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

onMounted(() => {
  tick()
  timer = setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <header class="prism-rail">
    <span class="prism-rail__state" :data-state="props.profile.status ?? 'online'">
      {{ (props.profile.status ?? 'online').toUpperCase() }}
    </span>
    <span class="prism-rail__handle">@{{ props.profile.username }}</span>
    <time class="prism-rail__clock">{{ clock }}</time>
  </header>
</template>
