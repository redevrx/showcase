<script setup lang="ts">
import type { ProfileLink } from '~/types/profile'

const props = defineProps<{ links: ProfileLink[] }>()
</script>

<template>
  <section class="prism-links" aria-label="Links">
    <p class="prism-links__label">LINKS · {{ props.links.length }}</p>

    <ul class="prism-links__list">
      <li v-for="(link, i) in props.links" :key="link.url + i">
        <a class="prism-link" :href="link.url" target="_blank" rel="noopener noreferrer">
          <span class="prism-link__index">{{ String(i + 1).padStart(2, '0') }}</span>
          <span v-if="link.icon" class="prism-link__icon">
            <IconGlyph :name="link.icon" :size="16" />
          </span>
          <span class="prism-link__body">
            <span class="prism-link__label">{{ link.label }}</span>
            <span v-if="link.meta" class="prism-link__meta">{{ link.meta }}</span>
          </span>
          <span class="prism-link__arrow" aria-hidden="true">→</span>
        </a>
      </li>
    </ul>

    <p v-if="!props.links.length" class="prism-links__empty">ยังไม่มีลิงก์ — เพิ่มได้ใน Studio</p>
  </section>
</template>
