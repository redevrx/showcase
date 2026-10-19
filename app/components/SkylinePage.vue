<script setup lang="ts">
import type { Profile } from '~/types/profile'
import { buildBeats } from '~/lib/skyline/beats'

const props = defineProps<{ profile: Profile }>()

const beats = computed(() => buildBeats({
  stats: !!props.profile.stats,
  links: (props.profile.links?.length ?? 0) > 0,
  music: !!props.profile.nowPlaying,
  socials: (props.profile.socials?.length ?? 0) > 0,
}))
const spacerUnits = computed(() => beats.value.length + 2)

const gl = ref<'boot' | 'live' | 'off'>('boot')
const cover = ref(true)
const deckVis = ref(false)
const qr = ref('')
const deckEl = ref<HTMLElement | null>(null)

const shareUrl = computed(() =>
  typeof window !== 'undefined'
    ? `${window.location.origin}/p/${props.profile.username}`
    : `/p/${props.profile.username}`,
)

const statusLabel = computed(() => ({
  online: 'ONLINE',
  idle: 'IDLE',
  dnd: 'DND',
  offline: 'OFFLINE',
}[props.profile.status] ?? 'ONLINE'))

function num(v: number) {
  return v.toLocaleString('en-US')
}

function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return (u.host + u.pathname).replace(/^www\./, '').replace(/\/$/, '')
  } catch {
    return url
  }
}

watch(gl, (v) => {
  if (v === 'off') {
    cover.value = false
    deckVis.value = true
  } else if (v === 'live') {
    setTimeout(() => { cover.value = false }, 420)
  }
})

onMounted(async () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cover.value = false
  }
  setTimeout(() => { cover.value = false }, 3400)

  try {
    const mod = await import('qrcode')
    const QR = (mod as unknown as { default?: typeof mod }).default ?? mod
    qr.value = await QR.toDataURL(`${window.location.origin}/p/${props.profile.username}`, {
      width: 560,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#05070d', light: '#eef5ff' },
    })
  } catch {
    qr.value = ''
  }

  const el = deckEl.value
  if (!el || !('IntersectionObserver' in window)) {
    deckVis.value = true
    return
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        deckVis.value = true
        io.disconnect()
      }
    }
  }, { rootMargin: '0px 0px -10% 0px' })
  io.observe(el)
  onBeforeUnmount(() => io.disconnect())
})
</script>

<template>
  <div
    class="skyline"
    :style="{ '--primary': profile.theme.primary, '--accent': profile.theme.accent }"
  >
    <SkylineCanvas
      :profile="profile"
      progress-selector=".skyline-scroll"
      @ready="gl = 'live'"
      @failed="gl = 'off'"
    />

    <!-- the scroll driver — the length of the flight -->
    <div
      class="skyline-scroll"
      :class="{ 'is-off': gl === 'off' }"
      :style="{ '--units': spacerUnits }"
      aria-hidden="true"
    />

    <SkylineHud v-if="gl !== 'off'" :profile="profile" :beats="beats" />

    <Transition name="sky-fade">
      <div v-if="cover" class="skyline-boot" aria-hidden="true">
        <div class="skyline-boot__box">
          <span class="skyline-boot__brand">SPAWN // SKYLINE</span>
          <span class="skyline-boot__state">กำลังก่อเมือง…</span>
          <span class="skyline-boot__bar"><i /></span>
        </div>
      </div>
    </Transition>

    <!-- the rooftop gate, in DOM: the profile itself, always reachable -->
    <main ref="deckEl" class="skyline-deck" :class="{ 'is-fallback': gl === 'off', 'is-vis': deckVis }">
      <section class="deck-card deck-id">
        <div class="deck-id__portrait">
          <img v-if="profile.avatar" :src="profile.avatar" :alt="profile.displayName" />
          <span v-else class="deck-id__glyph">◈</span>
        </div>
        <div class="deck-id__meta">
          <p class="deck-kicker">SKYLINE // โปรไฟล์</p>
          <h1 class="deck-name">{{ profile.displayName }}</h1>
          <p class="deck-handle">
            <span>@{{ profile.username }}</span>
            <span class="deck-status" :data-status="profile.status">{{ statusLabel }}</span>
          </p>
          <p class="deck-tag">{{ profile.tagline }}</p>
          <ul v-if="profile.badges?.length" class="deck-badges">
            <li v-for="b in profile.badges" :key="b.label" :data-tone="b.tone || 'neutral'">{{ b.label }}</li>
          </ul>
        </div>
      </section>

      <section v-if="profile.stats" class="deck-card deck-stats">
        <div v-if="profile.stats.views != null" class="deck-stat">
          <strong>{{ num(profile.stats.views) }}</strong><span>VIEWS</span>
        </div>
        <div v-if="profile.stats.likes != null" class="deck-stat">
          <strong>{{ num(profile.stats.likes) }}</strong><span>LIKES</span>
        </div>
        <div v-if="profile.stats.since" class="deck-stat">
          <strong>{{ profile.stats.since }}</strong><span>SINCE</span>
        </div>
      </section>

      <section v-if="profile.links?.length" class="deck-card deck-links">
        <h2 class="deck-title">ลิงก์</h2>
        <ul>
          <li v-for="l in profile.links" :key="l.label + l.url">
            <a :href="l.url" target="_blank" rel="noopener">
              <span class="deck-link__label">{{ l.label }}</span>
              <span class="deck-link__meta">{{ l.meta || hostOf(l.url) }}</span>
              <span class="deck-link__go" aria-hidden="true">↗</span>
            </a>
          </li>
        </ul>
      </section>

      <section v-if="profile.socials?.length" class="deck-card deck-social">
        <h2 class="deck-title">ช่องทาง</h2>
        <ul>
          <li v-for="s in profile.socials" :key="s.platform + s.url">
            <a :href="s.url" target="_blank" rel="noopener">
              <strong>{{ s.platform }}</strong>
              <span>{{ s.handle || hostOf(s.url) }}</span>
            </a>
          </li>
        </ul>
      </section>

      <section v-if="qr" class="deck-card deck-qr">
        <img :src="qr" alt="QR ของโปรไฟล์นี้" />
        <div>
          <h2 class="deck-title">พาประตูเมืองไปด้วย</h2>
          <p>สแกน QR เพื่อเปิดโปรไฟล์นี้บนมือถือ</p>
          <p class="deck-qr__url">{{ shareUrl }}</p>
        </div>
      </section>

      <footer class="deck-foot">
        <NuxtLink to="/" class="deck-foot__brand">SPAWN</NuxtLink>
        <span>·</span>
        <span>SKYLINE TEMPLATE</span>
        <span>·</span>
        <span>{{ gl === 'off' ? 'DOM FALLBACK' : 'RENDERED ON GPU' }}</span>
      </footer>
    </main>

    <LiveDock :socials="profile.socials" :now-playing="profile.nowPlaying" />
  </div>
</template>
