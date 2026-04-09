<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAdminDevice } from '../api/client'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const err = ref('')
const device = ref<Record<string, unknown> | null>(null)

async function load() {
  loading.value = true
  err.value = ''
  try {
    device.value = (await getAdminDevice(route.params.id as string)) as Record<string, unknown>
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '加载失败'
    device.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    load()
  },
  { immediate: true }
)

function goLogs() {
  router.push(`/devices/${route.params.id}/logs`)
}
</script>

<template>
  <div v-if="loading" class="text-slate-500">加载中…</div>
  <div v-else-if="err" class="text-red-600">{{ err }}</div>
  <div v-else-if="device" class="space-y-4">
    <div class="admin-card p-6">
      <h2 class="text-lg font-bold text-slate-900">设备信息</h2>
      <dl class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt class="text-slate-500">device_id</dt>
          <dd class="font-mono text-slate-900">{{ device.device_id }}</dd>
        </div>
        <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt class="text-slate-500">在线</dt>
          <dd :class="device.online ? 'text-emerald-600' : 'text-slate-400'">{{ device.online ? '在线' : '离线' }}</dd>
        </div>
        <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt class="text-slate-500">固件</dt>
          <dd>{{ device.fw_version || '—' }}</dd>
        </div>
        <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt class="text-slate-500">最后上报</dt>
          <dd class="text-slate-600">{{ device.last_seen_at || '—' }}</dd>
        </div>
      </dl>
      <button type="button" class="mt-6 rounded-lg bg-[#2563eb] text-white px-5 py-2.5 text-sm font-semibold" @click="goLogs">
        查看操作日志
      </button>
    </div>
  </div>
</template>
