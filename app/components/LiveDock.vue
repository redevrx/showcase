<script setup lang="ts">
import type { ProfileNowPlaying, ProfileSocial } from '~/types/profile'

const props = defineProps<{
  socials: ProfileSocial[]
  nowPlaying?: ProfileNowPlaying
}>()

const bars = [0, 1, 2, 3, 4]
const SPOTIFY_EMBED_ID = 'prism-spotify-embed'

const audioEl = ref<HTMLAudioElement | null>(null)
const filePlaying = ref(false)
const blocked = ref(false)
const current = ref(0)
const duration = ref(0)
const spotifyOpen = ref(false)
const spotifyPlaying = ref(false)
const spotifyPos = ref(0)
const spotifyDur = ref(0)

let spotifyController: any = null
let spotifyWantsPlay = false

const np = computed(() => props.nowPlaying)
const hasFile = computed(() => !!np.value?.src)
const hasSpotify = computed(() => !!np.value?.spotify)
const isPlayer = computed(() => hasFile.value || hasSpotify.value)

const spotifyUri = computed(() => {
  const m = (np.value?.spotify ?? '').match(
    /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode)\/([A-Za-z0-9]+)/,
  )
  return m ? `spotify:${m[1]}:${m[2]}` : ''
})

const eqActive = computed(() =>
  isPlayer.value ? filePlaying.value || spotifyPlaying.value : !!np.value?.playing,
)

const pct = computed(() => (duration.value > 0 ? Math.min(100, (current.value / duration.value) * 100) : 0))

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const timeLabel = computed(() => {
  if (hasFile.value) return duration.value && current.value ? `${fmt(current.value)} / ${fmt(duration.value)}` : ''
  if (hasSpotify.value && spotifyDur.value > 0) {
    return `${fmt(Math.min(spotifyPos.value, spotifyDur.value))} / ${fmt(spotifyDur.value)}`
  }
  return ''
})

/* ------------------------------- MP3 player ------------------------------- */

function syncPlay() {
  const el = audioEl.value
  if (!el) return
  filePlaying.value = !el.paused
  current.value = el.currentTime
  duration.value = Number.isFinite(el.duration) ? el.duration : 0
}

async function toggleFile() {
  const el = audioEl.value
  if (!el) return
  if (el.paused) {
    try {
      await el.play()
      blocked.value = false
    } catch {
      blocked.value = true
    }
  } else {
    el.pause()
  }
}

function seek(event: Event) {
  const el = audioEl.value
  if (el && duration.value > 0) {
    el.currentTime = (Number((event.target as HTMLInputElement).value) / 1000) * duration.value
    syncPlay()
  }
}

/* ----------------------------- Spotify embed ------------------------------ */

function ensureSpotifyApi(): Promise<any> {
  const w = window as any
  if (w.__spawnSpotifyApi) return Promise.resolve(w.__spawnSpotifyApi)
  if (w.__spawnSpotifyApiLoading) return w.__spawnSpotifyApiLoading
  w.__spawnSpotifyApiLoading = new Promise((resolve) => {
    const prev = w.onSpotifyIframeApiReady
    w.onSpotifyIframeApiReady = (api: any) => {
      w.__spawnSpotifyApi = api
      if (typeof prev === 'function') prev(api)
      resolve(api)
    }
    const s = document.createElement('script')
    s.src = 'https://open.spotify.com/embed/iframe-api/v1'
    s.async = true
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
  return w.__spawnSpotifyApiLoading
}

async function setupSpotify() {
  if (spotifyController) return
  const el = document.getElementById(SPOTIFY_EMBED_ID)
  if (!el || !spotifyUri.value) return
  const api = await ensureSpotifyApi()
  if (!api || spotifyController || !document.getElementById(SPOTIFY_EMBED_ID)) return
  try {
    api.createController(el, { uri: spotifyUri.value, width: '100%', height: 80 }, (controller: any) => {
      spotifyController = controller
      controller.addListener('playback_update', (e: any) => onSpotifyUpdate(e?.data ?? {}))
      if (import.meta.dev) (window as any).__spawnSpotify = controller
      if (spotifyWantsPlay) {
        spotifyWantsPlay = false
        try { controller.play() } catch {}
      }
      /* iframe เพิ่งถูกต่อเข้าจอ — เลื่อนการ์ดให้เห็นตัวเล่นเต็ม ๆ */
      const reveal = () =>
        document.querySelector('.prism-now__embed')?.scrollIntoView?.({ block: 'end', behavior: 'smooth' })
      requestAnimationFrame(reveal)
      setTimeout(reveal, 450)
    })
  } catch {}
}

function teardownSpotify() {
  try { spotifyController?.destroy?.() } catch {}
  spotifyController = null
  spotifyWantsPlay = false
  spotifyPlaying.value = false
  spotifyPos.value = 0
  spotifyDur.value = 0
}

function onSpotifyUpdate(data: any) {
  const pos = Number(data.position) || 0 // ms
  const dur = Number(data.duration) || 0 // ms
  spotifyPos.value = pos / 1000
  spotifyDur.value = dur / 1000
  spotifyPlaying.value = !data.isPaused
  /* loop จนกว่าจะกดหยุด — เล่นจบแล้วย้อนกลับไปต้นอัตโนมัติ */
  if (dur > 500 && pos > 500 && pos >= dur - 900) {
    try {
      spotifyController?.seek(0)
      spotifyController?.play()
    } catch {}
  }
}

async function toggleSpotify() {
  spotifyOpen.value = !spotifyOpen.value
  if (spotifyOpen.value) {
    spotifyWantsPlay = true
    await nextTick()
    setupSpotify()
  } else {
    teardownSpotify()
  }
}

function toggle() {
  if (hasSpotify.value && !hasFile.value) return void toggleSpotify()
  return void toggleFile()
}

/* ------------------------- first gesture autoplay ------------------------- */

function onFirstGesture(event: Event) {
  if ((event.target as Element | null)?.closest?.('.prism-now')) return
  if (!np.value?.playing) return
  const el = audioEl.value
  if (hasFile.value && el && el.paused) {
    el.play().catch(() => { blocked.value = true })
  }
  if (hasSpotify.value && !hasFile.value && !spotifyOpen.value) {
    spotifyWantsPlay = true
    spotifyOpen.value = true
    nextTick().then(setupSpotify)
  }
}

onMounted(() => {
  if (!np.value?.playing || !isPlayer.value) return
  const el = audioEl.value
  if (hasFile.value && el) {
    el.play().catch(() => { blocked.value = true })
  }
  window.addEventListener('pointerdown', onFirstGesture, { once: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onFirstGesture)
  teardownSpotify()
})
</script>

<template>
  <section class="prism-dock">
    <ul v-if="props.socials.length" class="prism-dock__socials" aria-label="Socials">
      <li v-for="s in props.socials" :key="s.platform + s.url">
        <a
          class="prism-social"
          :href="s.url"
          target="_blank"
          rel="noopener noreferrer"
          :title="s.handle ? s.platform + ' · ' + s.handle : s.platform"
          :aria-label="s.platform"
        >
          <IconGlyph :name="s.platform" :size="18" />
        </a>
      </li>
    </ul>

    <div
      v-if="props.nowPlaying"
      class="prism-now"
      :class="{ 'prism-now--paused': !eqActive, 'prism-now--player': isPlayer }"
    >
      <button
        v-if="isPlayer"
        class="prism-now__toggle"
        type="button"
        :aria-label="(filePlaying || spotifyOpen) ? 'หยุดเพลง' : 'เล่นเพลง'"
        @click="toggle"
      >
        <svg v-if="!filePlaying && !spotifyOpen" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 1.5 10 6l-7.5 4.5Z" />
        </svg>
        <svg v-else viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z" />
        </svg>
      </button>

      <span class="prism-now__eq" :class="{ 'prism-now__eq--mini': isPlayer }" aria-hidden="true">
        <i v-for="b in bars" :key="b" :style="{ '--d': `${b * 0.12}s` }" />
      </span>

      <span class="prism-now__meta">
        <span class="prism-now__title">{{ props.nowPlaying.title }}</span>
        <span class="prism-now__artist">{{ props.nowPlaying.artist }}</span>
      </span>

      <span v-if="isPlayer && blocked" class="prism-now__hint">แตะ ▶ เพื่อเล่น</span>
      <span v-else-if="isPlayer" class="prism-now__time">{{ hasFile ? timeLabel : (timeLabel || 'SPOTIFY') }}</span>
      <span v-else-if="props.nowPlaying.playing" class="prism-now__live">LIVE</span>

      <input
        v-if="hasFile"
        class="prism-now__scrub"
        type="range"
        min="0"
        max="1000"
        step="1"
        :value="Math.round(pct * 10)"
        :style="{ '--p': pct + '%' }"
        aria-label="เลื่อนตำแหน่งเพลง"
        @input="seek"
      >

      <div v-if="spotifyOpen && spotifyUri" class="prism-now__embed">
        <div :id="SPOTIFY_EMBED_ID" class="prism-now__embedbox" />
        <a
          v-if="np?.spotify"
          class="prism-now__spotlink"
          :href="np.spotify"
          target="_blank"
          rel="noopener noreferrer"
        >เปิดใน Spotify ↗</a>
      </div>

      <audio
        v-if="hasFile"
        ref="audioEl"
        :src="np!.src"
        preload="none"
        loop
        @play="syncPlay"
        @pause="syncPlay"
        @timeupdate="syncPlay"
        @loadedmetadata="syncPlay"
      />
    </div>
  </section>
</template>
