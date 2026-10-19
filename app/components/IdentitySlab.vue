<script setup lang="ts">
import type { Profile } from '~/types/profile'

const props = defineProps<{ profile: Profile }>()

const stats = computed(() => {
  const s = props.profile.stats
  if (!s) return []
  const out: Array<{ k: string, v: string }> = []
  if (typeof s.views === 'number') out.push({ k: 'VIEWS', v: s.views.toLocaleString('en-US') })
  if (typeof s.likes === 'number') out.push({ k: 'LIKES', v: s.likes.toLocaleString('en-US') })
  if (s.since) out.push({ k: 'SINCE', v: s.since })
  return out
})
</script>

<template>
  <section class="prism-slab">
    <div class="prism-slab__head">
      <span class="prism-slab__index">00</span>
      <span class="prism-slab__rule" />
      <span>PLAYER PLATE</span>
    </div>

    <div class="prism-slab__id">
      <span class="prism-slab__plate">
        <AvatarGlyph :src="props.profile.avatar || undefined" :name="props.profile.displayName" :size="64" />
        <i class="prism-slab__presence" :data-state="props.profile.status ?? 'online'" />
      </span>
      <div class="prism-slab__meta">
        <h1 class="prism-slab__name">{{ props.profile.displayName }}</h1>
        <p class="prism-slab__handle">@{{ props.profile.username }}</p>
      </div>
    </div>

    <p v-if="props.profile.tagline" class="prism-slab__tagline">{{ props.profile.tagline }}</p>

    <ul v-if="props.profile.badges?.length" class="prism-slab__badges">
      <li
        v-for="badge in props.profile.badges"
        :key="badge.label"
        class="prism-slab__badge"
        :data-tone="badge.tone ?? 'neutral'"
      >
        <IconGlyph v-if="badge.icon" :name="badge.icon" :size="12" />
        {{ badge.label }}
      </li>
    </ul>

    <dl v-if="stats.length" class="prism-slab__stats">
      <div v-for="s in stats" :key="s.k" class="prism-slab__stat">
        <dt>{{ s.k }}</dt>
        <dd>{{ s.v }}</dd>
      </div>
    </dl>
  </section>
</template>
