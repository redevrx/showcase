<script setup lang="ts">
import type { Profile, ProfileBadge, ProfileLink, ProfileSocial } from '~/types/profile'
import { ICON_PATHS } from '~/lib/icon-data'

useHead({ title: 'STUDIO — spawn' })

const DRAFT_KEY = 'spawn:studio-draft'
const ICON_KEYS = Object.keys(ICON_PATHS)
const CURRENT_YEAR = String(new Date().getFullYear())

const route = useRoute()

const PRESETS: Record<string, { primary: string, accent: string }> = {
  signal: { primary: '#CFE6FF', accent: '#FFB65C' },
  aurora: { primary: '#E5C9FF', accent: '#7DF2E3' },
  ember: { primary: '#FFD3B0', accent: '#FF7A59' },
  mint: { primary: '#BFF3D8', accent: '#5CE0A8' },
}

const STATUSES = [
  { value: 'online', label: 'ONLINE' },
  { value: 'idle', label: 'IDLE' },
  { value: 'dnd', label: 'DND' },
  { value: 'offline', label: 'OFFLINE' },
]
const TONES = ['primary', 'accent', 'live', 'neutral']

function emptyProfile(): Profile {
  return {
    username: '',
    template: 'prism',
    displayName: '',
    tagline: '',
    avatar: '',
    status: 'online',
    badges: [],
    theme: { preset: 'signal', ...PRESETS.signal },
    stats: { views: 0, likes: 0, since: CURRENT_YEAR },
    socials: [],
    links: [],
    nowPlaying: { playing: false, title: '', artist: '', progress: 0, bpm: 110, src: '', spotify: '' },
    scene: { moteCount: 3200, motion: 1 },
  }
}

const form = reactive<Profile>(emptyProfile())

const requestURL = useRequestURL()
const origin = computed(() => requestURL.origin)

const { data: listData, refresh: refreshList } = await useFetch<{ profiles: { username: string, displayName: string, tagline: string, updatedAt: number }[] }>('/api/studio/profiles')

const saving = ref(false)
const uploading = ref(false)
const savedPath = ref('')
const errorMsg = ref('')
const copied = ref(false)
const previewKey = ref(0)
const previewUser = ref('michael')
const showPreview = ref(true)
const uploadInput = ref<HTMLInputElement | null>(null)
const draftRestored = ref(false)

const shareUrl = computed(() => (savedPath.value ? `${origin.value}${savedPath.value}` : ''))
const canSave = computed(() => /^[a-z0-9][a-z0-9_-]{1,31}$/.test(form.username))

/* ------------------------------- loading / lists ------------------------------- */

function applyProfile(p: Profile) {
  Object.assign(form, JSON.parse(JSON.stringify({
    ...emptyProfile(),
    ...p,
    theme: { ...emptyProfile().theme, ...(p.theme ?? {}) },
    stats: { ...emptyProfile().stats, ...(p.stats ?? {}) },
    nowPlaying: { ...emptyProfile().nowPlaying, ...(p.nowPlaying ?? {}) },
    scene: { ...emptyProfile().scene, ...(p.scene ?? {}) },
    badges: p.badges ?? [],
    socials: p.socials ?? [],
    links: p.links ?? [],
  })))
}

async function loadProfile(username: string) {
  errorMsg.value = ''
  try {
    const p = await $fetch<Profile>(`/api/profiles/${username}`)
    applyProfile(p)
    previewUser.value = username
    savedPath.value = `/p/${username}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch {
    errorMsg.value = `โหลดโปรไฟล์ @${username} ไม่สำเร็จ`
  }
}

function newProfile() {
  applyProfile(emptyProfile())
  savedPath.value = ''
  errorMsg.value = ''
  clearDraft()
}

async function removeProfile(username: string) {
  if (!window.confirm(`ลบโปรไฟล์ @${username} ?`)) return
  await $fetch(`/api/studio/profiles/${username}`, { method: 'DELETE' })
  await refreshList()
  if (form.username === username) newProfile()
}

/* ----------------------------------- save ----------------------------------- */

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  errorMsg.value = ''
  try {
    const res = await $fetch<{ ok: boolean, path: string }>('/api/studio/profiles', {
      method: 'POST',
      body: { profile: JSON.parse(JSON.stringify(form)) },
    })
    savedPath.value = res.path
    previewUser.value = form.username
    previewKey.value = Date.now()
    copied.value = false
    clearDraft()
    await refreshList()
  } catch (e: any) {
    errorMsg.value = e?.data?.message || e?.data?.statusMessage || 'บันทึกไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

async function copyShare() {
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1600)
  } catch {
    errorMsg.value = 'คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความแล้วคัดลอกเอง'
  }
}

/* --------------------------------- uploads --------------------------------- */

async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!canSave.value) {
    errorMsg.value = 'ตั้ง username ก่อนอัปโหลดรูป'
    return
  }
  uploading.value = true
  errorMsg.value = ''
  try {
    const data = new FormData()
    data.append('username', form.username)
    data.append('file', file)
    const res = await $fetch<{ ok: boolean, url: string }>('/api/studio/upload', { method: 'POST', body: data })
    form.avatar = res.url
  } catch (e: any) {
    errorMsg.value = e?.data?.statusMessage || 'อัปโหลดไม่สำเร็จ'
  } finally {
    uploading.value = false
  }
}

/* ---------------------------------- helpers --------------------------------- */

function applyPreset(name: string) {
  form.theme.preset = name
  const preset = PRESETS[name]
  if (preset) {
    form.theme.primary = preset.primary
    form.theme.accent = preset.accent
  }
}

function addBadge() { form.badges.push({ label: '', icon: '', tone: 'neutral' } as ProfileBadge) }
function addLink() { form.links.push({ label: '', meta: '', url: 'https://', icon: 'link' } as ProfileLink) }
function addSocial() { form.socials.push({ platform: 'instagram', url: 'https://', handle: '' } as ProfileSocial) }

/* ---------------------------------- draft ---------------------------------- */

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
  draftRestored.value = false
}

onMounted(() => {
  const edit = String(route.query.edit ?? '').toLowerCase()
  if (/^[a-z0-9][a-z0-9_-]{1,31}$/.test(edit)) {
    loadProfile(edit)
    return
  }
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      const draft = JSON.parse(raw)
      if (draft?.username !== undefined) {
        applyProfile(draft)
        draftRestored.value = true
      }
    }
  } catch {}
  if (listData.value?.profiles?.[0]?.username && !form.username) {
    previewUser.value = listData.value.profiles[0].username
  }
})

watch(form, () => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch {}
}, { deep: true })
</script>

<template>
  <div class="studio">
    <header class="studio__top">
      <NuxtLink to="/" class="studio__back">← หน้าแรก</NuxtLink>
      <p class="studio__wordmark">SPAWN <span>STUDIO</span></p>
      <button class="btn btn--ghost btn--sm studio__preview-toggle" type="button" @click="showPreview = !showPreview">
        {{ showPreview ? 'ซ่อน PREVIEW' : 'ดู PREVIEW' }}
      </button>
    </header>

    <div class="studio__grid">
      <!-- ------------------------------ FORM COLUMN ------------------------------ -->
      <div class="studio__form">
        <section class="panel">
          <h2 class="panel__title">PROFILES</h2>
          <div class="profiles">
            <div v-for="item in listData?.profiles ?? []" :key="item.username" class="profiles__row">
              <div class="profiles__meta">
                <p class="profiles__name">{{ item.displayName }}</p>
                <p class="profiles__handle">@{{ item.username }}</p>
              </div>
              <div class="profiles__actions">
                <button class="btn btn--ghost btn--sm" type="button" @click="loadProfile(item.username)">แก้ไข</button>
                <NuxtLink class="btn btn--ghost btn--sm" :to="`/p/${item.username}`" target="_blank">เปิด ↗</NuxtLink>
                <button class="btn btn--ghost btn--sm btn--danger" type="button" @click="removeProfile(item.username)">ลบ</button>
              </div>
            </div>
            <p v-if="!listData?.profiles?.length" class="profiles__empty">ยังไม่มีโปรไฟล์ใน data/profiles — เริ่มสร้างอันแรกเลย</p>
          </div>
          <button class="btn btn--ghost btn--sm profiles__new" type="button" @click="newProfile">+ สร้างใหม่</button>
        </section>

        <section class="panel">
          <h2 class="panel__title">TEMPLATE</h2>
          <div class="templates">
            <button
              class="template"
              :class="{ 'template--active': form.template === 'prism' }"
              type="button"
              :aria-pressed="form.template === 'prism'"
              @click="form.template = 'prism'"
            >
              <span class="template__name">PRISM</span>
              <span class="template__desc">particle-name entrance · grid · orbit socials</span>
            </button>
            <button
              class="template"
              :class="{ 'template--active': form.template === 'skyline' }"
              type="button"
              :aria-pressed="form.template === 'skyline'"
              @click="form.template = 'skyline'"
            >
              <span class="template__name">SKYLINE</span>
              <span class="template__desc">บินผ่านเมืองนีออน · scroll flight · ป้ายข้อมูลบนตึก</span>
            </button>
            <button class="template template--soon" type="button" disabled>
              <span class="template__name">ORBIT</span>
              <span class="template__desc">เร็ว ๆ นี้</span>
            </button>
          </div>
        </section>

        <section class="panel">
          <h2 class="panel__title">IDENTITY</h2>
          <div class="grid2">
            <label class="field">
              <span class="field__label">username (= path)</span>
              <input v-model="form.username" class="input input--mono" placeholder="michael" maxlength="32">
              <span class="field__hint">แชร์ที่ {{ origin }}/p/{{ form.username || 'username' }}</span>
            </label>
            <label class="field">
              <span class="field__label">ชื่อที่แสดง</span>
              <input v-model="form.displayName" class="input" placeholder="Michael" maxlength="40">
            </label>
          </div>

          <label class="field">
            <span class="field__label">tagline</span>
            <input v-model="form.tagline" class="input" placeholder="Love rabbit · ชิล ๆ แต่จริงจัง" maxlength="120">
          </label>

          <div class="grid2">
            <label class="field">
              <span class="field__label">สถานะ</span>
              <select v-model="form.status" class="input">
                <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </label>
            <div class="field">
              <span class="field__label">รูปโปรไฟล์</span>
              <div class="upload">
                <span class="upload__preview">
                  <AvatarGlyph :src="form.avatar" :name="form.displayName || form.username || '?'" :size="48" />
                </span>
                <button class="btn btn--ghost btn--sm" type="button" :disabled="uploading" @click="uploadInput?.click()">
                  {{ uploading ? 'กำลังอัปโหลด…' : 'เลือกรูป' }}
                </button>
                <button v-if="form.avatar" class="btn btn--ghost btn--sm btn--danger" type="button" @click="form.avatar = ''">เอารูปออก</button>
                <input ref="uploadInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" @change="onUpload">
              </div>
              <span class="field__hint">png / jpg / webp / gif / svg · ไม่เกิน 4MB — หรือวาง URL รูปด้านล่าง</span>
              <input v-model="form.avatar" class="input input--mono" placeholder="/uploads/michael/avatar.png หรือ https://…">
            </div>
          </div>
        </section>

        <section class="panel">
          <h2 class="panel__title">THEME</h2>
          <div class="presets">
            <button
              v-for="(p, name) in PRESETS"
              :key="name"
              class="preset"
              :class="{ 'preset--active': form.theme.preset === name }"
              type="button"
              @click="applyPreset(String(name))"
            >
              <span class="preset__dots">
                <i :style="{ background: p.primary }" />
                <i :style="{ background: p.accent }" />
              </span>
              <span class="preset__name">{{ name }}</span>
            </button>
          </div>
          <div class="grid2">
            <label class="field">
              <span class="field__label">primary</span>
              <span class="colorfield">
                <input v-model="form.theme.primary" class="input input--mono" maxlength="7">
                <input v-model="form.theme.primary" class="input--color" type="color">
              </span>
            </label>
            <label class="field">
              <span class="field__label">accent</span>
              <span class="colorfield">
                <input v-model="form.theme.accent" class="input input--mono" maxlength="7">
                <input v-model="form.theme.accent" class="input--color" type="color">
              </span>
            </label>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">BADGES</h2>
            <button class="btn btn--ghost btn--sm" type="button" @click="addBadge">+ เพิ่ม</button>
          </div>
          <div v-for="(badge, i) in form.badges" :key="`badge-${i}`" class="repeat">
            <input v-model="badge.label" class="input" placeholder="Diamond 1" maxlength="40">
            <select v-model="badge.icon" class="input">
              <option value="">— ไม่มีไอคอน —</option>
              <option v-for="k in ICON_KEYS" :key="k" :value="k">{{ k }}</option>
            </select>
            <select v-model="badge.tone" class="input">
              <option v-for="t in TONES" :key="t" :value="t">{{ t }}</option>
            </select>
            <button class="btn btn--ghost btn--sm btn--danger" type="button" @click="form.badges.splice(i, 1)">✕</button>
          </div>
          <p v-if="!form.badges.length" class="panel__empty">ยังไม่มี badge</p>
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">LINKS</h2>
            <button class="btn btn--ghost btn--sm" type="button" @click="addLink">+ เพิ่ม</button>
          </div>
          <div v-for="(link, i) in form.links" :key="`link-${i}`" class="repeat repeat--link">
            <input v-model="link.label" class="input" placeholder="Valorant" maxlength="60">
            <input v-model="link.url" class="input input--mono" placeholder="https://…">
            <input v-model="link.meta" class="input" placeholder="Peak Diamond 1 · AP" maxlength="120">
            <select v-model="link.icon" class="input">
              <option v-for="k in ICON_KEYS" :key="k" :value="k">{{ k }}</option>
            </select>
            <button class="btn btn--ghost btn--sm btn--danger" type="button" @click="form.links.splice(i, 1)">✕</button>
          </div>
          <p v-if="!form.links.length" class="panel__empty">ยังไม่มีลิงก์</p>
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">SOCIALS</h2>
            <button class="btn btn--ghost btn--sm" type="button" @click="addSocial">+ เพิ่ม</button>
          </div>
          <div v-for="(social, i) in form.socials" :key="`social-${i}`" class="repeat">
            <select v-model="social.platform" class="input">
              <option v-for="k in ICON_KEYS" :key="k" :value="k">{{ k }}</option>
            </select>
            <input v-model="social.url" class="input input--mono" placeholder="https://…">
            <input v-model="social.handle" class="input" placeholder="@handle" maxlength="60">
            <button class="btn btn--ghost btn--sm btn--danger" type="button" @click="form.socials.splice(i, 1)">✕</button>
          </div>
          <p v-if="!form.socials.length" class="panel__empty">ยังไม่มีโซเชียล</p>
        </section>

        <section class="panel">
          <h2 class="panel__title">NOW PLAYING</h2>
          <label class="toggle">
            <input v-model="form.nowPlaying!.playing" type="checkbox">
            <span>กำลังเล่นอยู่ (เปิดให้จังหวะพัลส์เดิน)</span>
          </label>
          <div class="grid2">
            <input v-model="form.nowPlaying!.title" class="input" placeholder="ชื่อเพลง" maxlength="80">
            <input v-model="form.nowPlaying!.artist" class="input" placeholder="ศิลปิน" maxlength="80">
          </div>
          <div class="grid2">
            <label class="field">
              <span class="field__label">progress %</span>
              <input v-model.number="form.nowPlaying!.progress" class="input" type="number" min="0" max="100">
            </label>
            <label class="field">
              <span class="field__label">bpm (ใช้กับจังหวะพัลส์)</span>
              <input v-model.number="form.nowPlaying!.bpm" class="input" type="number" min="40" max="200">
            </label>
          </div>
          <label class="field">
            <span class="field__label">ไฟล์เสียง (MP3) — /audio/… หรือ URL เต็ม</span>
            <input v-model="form.nowPlaying!.src" class="input input--mono" placeholder="/audio/song.mp3">
          </label>
          <label class="field">
            <span class="field__label">Spotify — track / album / playlist URL</span>
            <input v-model="form.nowPlaying!.spotify" class="input input--mono" placeholder="https://open.spotify.com/track/…">
          </label>
        </section>

        <section class="panel">
          <h2 class="panel__title">STATS &amp; SCENE</h2>
          <div class="grid3">
            <label class="field">
              <span class="field__label">views</span>
              <input v-model.number="form.stats!.views" class="input" type="number" min="0">
            </label>
            <label class="field">
              <span class="field__label">likes</span>
              <input v-model.number="form.stats!.likes" class="input" type="number" min="0">
            </label>
            <label class="field">
              <span class="field__label">since (ปี)</span>
              <input v-model="form.stats!.since" class="input" maxlength="4" placeholder="2023">
            </label>
          </div>
          <label class="field">
            <span class="field__label">mote count — {{ form.scene!.moteCount }} (ยิ่งมากยิ่งสวย ยิ่งกินเครื่อง)</span>
            <input v-model.number="form.scene!.moteCount" class="input--range" type="range" min="400" max="8000" step="200">
          </label>
        </section>
      </div>

      <!-- ---------------------------- PREVIEW COLUMN ---------------------------- -->
      <aside v-show="showPreview" class="studio__preview">
        <div class="studio__preview-bar">
          <span class="studio__preview-label">PREVIEW · @{{ previewUser }}</span>
          <div class="studio__preview-actions">
            <button class="btn btn--ghost btn--sm" type="button" @click="previewKey = Date.now()">↻</button>
            <NuxtLink class="btn btn--ghost btn--sm" :to="`/p/${previewUser}`" target="_blank">↗</NuxtLink>
          </div>
        </div>
        <iframe
          :key="`${previewUser}-${previewKey}`"
          class="studio__frame"
          :src="`/p/${previewUser}?k=${previewKey}`"
          title="profile preview"
        />
        <p class="studio__preview-hint">preview จะอัปเดตหลังกด “บันทึก”</p>
      </aside>
    </div>

    <!-- ------------------------------- SAVE BAR ------------------------------- -->
    <div class="savebar">
      <div class="savebar__info">
        <p class="savebar__path">→ /p/{{ form.username || 'username' }}</p>
        <p v-if="errorMsg" class="savebar__error">{{ errorMsg }}</p>
        <p v-else-if="savedPath" class="savebar__saved">บันทึกลง data/profiles/{{ form.username }}.json แล้ว ·<button class="savebar__copy" type="button" @click="copyShare">{{ copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์แชร์' }}</button></p>
        <p v-else-if="draftRestored" class="savebar__draft">กู้คืน draft ล่าสุดในเครื่องแล้ว</p>
      </div>
      <button class="btn btn--primary" type="button" :disabled="!canSave || saving" @click="save">
        {{ saving ? 'กำลังบันทึก…' : 'บันทึก' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.studio {
  position: relative;
  z-index: 10;
  max-width: 1240px;
  margin: 0 auto;
  padding: 18px 18px 120px;
}

.studio__top {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 2px 18px;
}

.studio__back {
  font-family: var(--font-display);
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--ink-dim);
}

.studio__back:hover { color: var(--primary); }

.studio__wordmark {
  flex: 1;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.34em;
  color: var(--ink);
}

.studio__wordmark span { color: var(--accent); }

.studio__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 460px);
  gap: 18px;
  align-items: start;
}

.studio__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.panel {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel__title {
  font-family: var(--font-display);
  font-size: 10px;
  letter-spacing: 0.34em;
  color: var(--ink-dim);
}

.panel__empty,
.profiles__empty {
  font-size: 12px;
  color: var(--ink-faint);
}

.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.field__label {
  font-family: var(--font-display);
  font-size: 9px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.field__hint {
  font-size: 11px;
  color: var(--ink-faint);
  overflow-wrap: anywhere;
}

.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(5, 7, 12, 0.65);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 13.5px;
}

select.input { appearance: none; }

.input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--primary) 55%, transparent);
}

.input--mono {
  font-family: var(--font-display);
  font-size: 12.5px;
  letter-spacing: 0.04em;
}

.input--color {
  width: 46px;
  height: 40px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(5, 7, 12, 0.65);
}

.input--range { width: 100%; accent-color: var(--accent); }

.colorfield { display: flex; gap: 8px; align-items: center; }

.toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: var(--ink-dim);
}

.toggle input { accent-color: var(--accent); }

.repeat {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr) minmax(0, 0.9fr) auto;
  gap: 8px;
  align-items: center;
}

.repeat--link {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1.2fr) minmax(0, 0.8fr) auto;
}

.profiles { display: flex; flex-direction: column; gap: 8px; }

.profiles__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(5, 7, 12, 0.45);
}

.profiles__meta { min-width: 0; flex: 1; }
.profiles__name { font-size: 13.5px; font-weight: 600; }
.profiles__handle { font-family: var(--font-display); font-size: 10px; letter-spacing: 0.14em; color: var(--ink-dim); }

.profiles__actions { display: flex; gap: 6px; }

.profiles__new { align-self: flex-start; }

.templates { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }

.template {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(5, 7, 12, 0.45);
  color: var(--ink);
}

.template--active {
  border-color: color-mix(in srgb, var(--primary) 60%, transparent);
  box-shadow: 0 0 26px -14px var(--primary);
}

.template--soon { opacity: 0.4; }

.template:not(:disabled) { cursor: pointer; }

.template:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
}

.template__name {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.24em;
}

.template__desc { font-size: 11px; color: var(--ink-dim); }

.presets { display: flex; flex-wrap: wrap; gap: 8px; }

.preset {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(5, 7, 12, 0.45);
  color: var(--ink-dim);
}

.preset--active { border-color: color-mix(in srgb, var(--accent) 55%, transparent); color: var(--ink); }

.preset__dots { display: inline-flex; gap: 4px; }
.preset__dots i { width: 10px; height: 10px; border-radius: 50%; display: block; }
.preset__name { font-family: var(--font-display); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; }

.upload { display: flex; align-items: center; gap: 10px; }
.upload__preview { flex: none; border-radius: 50%; overflow: hidden; }

/* ---- preview column ---- */

.studio__preview {
  position: sticky;
  top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.studio__preview-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.studio__preview-label {
  font-family: var(--font-display);
  font-size: 10px;
  letter-spacing: 0.26em;
  color: var(--ink-dim);
}

.studio__preview-actions { display: flex; gap: 6px; }

.studio__frame {
  width: 100%;
  height: min(76vh, 820px);
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--void);
}

.studio__preview-hint {
  font-size: 11px;
  color: var(--ink-faint);
  text-align: center;
}

/* ---- save bar ---- */

.savebar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px max(18px, calc((100vw - 1240px) / 2 + 18px));
  border-top: 1px solid var(--line);
  background: rgba(5, 7, 12, 0.92);
}

.savebar__info { flex: 1; min-width: 0; }

.savebar__path {
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--ink-dim);
}

.savebar__error { font-size: 11.5px; color: var(--dnd); }
.savebar__saved { font-size: 11.5px; color: var(--live); }
.savebar__draft { font-size: 11.5px; color: var(--accent); }

.savebar__copy {
  background: none;
  border: none;
  padding: 0;
  margin-left: 4px;
  color: var(--primary);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.btn--sm { padding: 8px 12px; font-size: 10px; letter-spacing: 0.16em; }
.btn--danger { color: var(--dnd); }
.btn--danger:hover { border-color: color-mix(in srgb, var(--dnd) 50%, transparent); }

.btn:disabled { opacity: 0.5; pointer-events: none; }

@media (max-width: 1020px) {
  .studio__grid { grid-template-columns: 1fr; }
  .studio__preview { position: static; }
  .studio__frame { height: 70vh; }
}

@media (max-width: 640px) {
  .grid2, .grid3 { grid-template-columns: 1fr; }
  .repeat, .repeat--link { grid-template-columns: 1fr 1fr; }
  .profiles__row { flex-wrap: wrap; }
}
</style>
