<script setup lang="ts">
import type { Profile } from '~/types/profile'
import { onSpawn } from '~/lib/bus'
import { buildStations } from '~/lib/prism/journey'

const route = useRoute()
const username = computed(() => String(route.params.username ?? '').toLowerCase())

const { data: profile, error } = await useFetch<Profile>(`/api/profiles/${username.value}`)
if (error.value || !profile.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'PLAYER NOT FOUND',
    message: `ไม่พบโปรไฟล์ @${username.value}`,
  })
}

useHead(() => ({
  title: `${profile.value!.displayName} — SPAWN`,
  meta: [
    { name: 'description', content: profile.value!.tagline },
    { property: 'og:title', content: `${profile.value!.displayName} — SPAWN` },
    { property: 'og:description', content: profile.value!.tagline },
  ],
}))

// The street. Scroll walks the camera from station to station; the itinerary
// is derived from the profile's own data (no badges → no info stop, no links
// → no avenue…) so the spacer, the dots and the 3D scene always agree.
const stations = computed(() => buildStations(profile.value!))
const activeStation = ref(0)

function goStation(i: number) {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
  window.scrollTo({ top: (i / Math.max(1, stations.value.length - 1)) * max, behavior: 'smooth' })
}

onMounted(() => {
  const el = document.documentElement
  const off = onSpawn((e) => {
    if (e.type === 'reveal') {
      el.dataset.entrance = 'done'
      try {
        sessionStorage.setItem('spawn:seen', '1')
      } catch {}
    } else if (e.type === 'station') {
      activeStation.value = e.i
    }
  })
  onBeforeUnmount(off)
})
</script>

<template>
  <SkylinePage v-if="profile!.template === 'skyline'" :profile="profile!" />
  <div
    v-else
    class="prism"
    :style="{
      '--primary': profile!.theme.primary,
      '--accent': profile!.theme.accent,
    }"
  >
    <PrismCanvas :profile="profile!" />
    <PrismIntro :profile="profile!" />

    <!-- the scroll driver — one viewport per station hop, invisible by design -->
    <div class="prism-scroll" :style="{ height: `${stations.length * 100}lvh` }" aria-hidden="true" />

    <nav class="prism-stations" aria-label="ทางเดินของโปรไฟล์">
      <button
        v-for="(s, i) in stations"
        :key="s.id"
        class="prism-stations__dot"
        :class="{ 'is-on': activeStation === i }"
        type="button"
        :aria-label="`ไปสถานี ${s.label}`"
        :aria-current="activeStation === i ? 'step' : undefined"
        @click="goStation(i)"
      >
        <span>{{ String(i + 1).padStart(2, '0') }}</span>
      </button>
    </nav>

    <p class="prism-hint">สกรอลล์เดินต่อ · ลากมองรอบ ๆ · คลิกป้ายเพื่อเปิด</p>

    <!-- DOM-first fallback — only ever seen when WebGL never comes up -->
    <main class="prism-content">
      <div class="reveal" style="--i: 0">
        <TopRail :profile="profile!" />
      </div>

      <div class="reveal" style="--i: 1">
        <IdentitySlab :profile="profile!" />
      </div>

      <div class="reveal" style="--i: 2">
        <LinkStack :links="profile!.links" />
      </div>

      <footer class="prism-foot reveal" style="--i: 3">
        <NuxtLink to="/" class="prism-foot__brand">SPAWN</NuxtLink>
        <span>·</span>
        <span>PRISM TEMPLATE</span>
        <span>·</span>
        <span>RENDERED ON GPU</span>
      </footer>
    </main>

    <LiveDock :socials="profile!.socials" :now-playing="profile!.nowPlaying" />
  </div>
</template>
