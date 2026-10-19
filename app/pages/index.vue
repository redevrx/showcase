<script setup lang="ts">
interface ProfileListItem {
  username: string
  displayName: string
  tagline: string
  status: string
  primary: string
  accent: string
  avatar: string
  updatedAt: number
}

useHead({
  title: 'SPAWN — 3D profile protocol',
  meta: [
    { name: 'description', content: 'สร้างโปรไฟล์ 3D สำหรับ link-in-bio — รูป ข้อมูล โซเชียล ลิงก์ทั้งหมดในโลกเดียว พร้อมลิงก์แชร์' },
  ],
})

const { data } = await useFetch<{ profiles: ProfileListItem[] }>('/api/studio/profiles')
const profiles = computed(() => data.value?.profiles ?? [])

const features = ['DROP-IN ENTRANCE', 'ORBIT SOCIALS', 'SHARE PATH 1 ลิงก์']

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ชม.ที่แล้ว`
  return `${Math.floor(hours / 24)} วันที่แล้ว`
}
</script>

<template>
  <div class="landing">
    <div class="landing__inner">
      <p class="landing__kicker">3D LINK-IN-BIO PROTOCOL</p>
      <h1 class="landing__wordmark">SPAWN</h1>
      <p class="landing__tagline">
        สร้างโปรไฟล์ 3D ของคุณเอง — รูป ข้อมูล โซเชียล และลิงก์ทั้งหมด
        อยู่ในโลกที่เรนเดอร์จริงบน GPU แล้วแชร์ออกไปเป็นลิงก์เดียว
      </p>

      <ul class="landing__features">
        <li v-for="feature in features" :key="feature">{{ feature }}</li>
      </ul>

      <div class="landing__actions">
        <NuxtLink class="btn btn--primary" to="/studio">เปิด STUDIO →</NuxtLink>
        <NuxtLink class="btn btn--ghost" to="/p/michael">ดูตัวอย่างโปรไฟล์</NuxtLink>
      </div>

      <section class="landing__profiles" aria-label="Profiles on this machine">
        <p class="landing__section-label">
          PROFILES บนเครื่องนี้ · {{ profiles.length }}
          <NuxtLink class="landing__section-link" to="/studio">จัดการใน Studio →</NuxtLink>
        </p>

        <ul v-if="profiles.length" class="landing__list">
          <li v-for="item in profiles" :key="item.username" class="landing__item">
            <NuxtLink
              class="prow"
              :to="`/p/${item.username}`"
              :style="{ '--primary': item.primary, '--accent': item.accent }"
            >
              <span class="prow__avatar">
                <AvatarGlyph :src="item.avatar || undefined" :name="item.displayName" :size="40" />
                <i class="prow__presence" :data-state="item.status" />
              </span>
              <span class="prow__meta">
                <span class="prow__name">{{ item.displayName }}</span>
                <span class="prow__tagline">{{ item.tagline || '—' }}</span>
              </span>
              <span class="prow__side">
                <span class="prow__handle">@{{ item.username }}</span>
                <ClientOnly><span class="prow__time">{{ timeAgo(item.updatedAt) }}</span></ClientOnly>
              </span>
              <span class="prow__arrow" aria-hidden="true">›</span>
            </NuxtLink>
            <NuxtLink class="prow__edit" :to="`/studio?edit=${item.username}`" :aria-label="`แก้ไข ${item.displayName}`">
              แก้ไข
            </NuxtLink>
          </li>
        </ul>

        <p v-else class="landing__empty">
          ยังไม่มีโปรไฟล์ในเครื่องนี้ — เปิด Studio เพื่อสร้างอันแรกได้เลย
        </p>
      </section>
    </div>

    <p class="landing__foot">SPAWN PROTOCOL v0.1 · CLOUDFLARE TUNNEL READY</p>
  </div>
</template>
