<script setup lang="ts">
import { ICON_PATHS, resolveIcon } from '~/lib/icon-data'

const props = withDefaults(defineProps<{ name?: string | null, size?: number }>(), { size: 24 })
const key = computed(() => resolveIcon(props.name))
const path = computed(() => ICON_PATHS[key.value] ?? '')
</script>

<template>
  <svg
    class="icon-glyph"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path v-if="path" :d="path" />
    <template v-else>
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="2.4" />
      <circle cx="12" cy="12" r="2.6" />
    </template>
  </svg>
</template>

<style scoped>
.icon-glyph {
  display: block;
}
</style>
