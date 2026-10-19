<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error.statusCode === 404)
const goHome = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="errorpage">
    <div class="errorpage__inner">
      <p class="errorpage__code">{{ error.statusCode ?? 500 }}</p>
      <p class="errorpage__title">{{ isNotFound ? 'PLAYER NOT FOUND' : 'SYSTEM FAULT' }}</p>
      <p class="errorpage__meta">
        {{ error.message || error.statusMessage || 'เกิดข้อผิดพลาดบางอย่าง ลองใหม่อีกครั้ง' }}
      </p>
      <button class="btn btn--primary" type="button" @click="goHome">
        กลับหน้าแรก
      </button>
    </div>
  </div>
</template>
