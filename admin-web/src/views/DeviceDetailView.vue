<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAdminDevice } from '../api/client'
import { formatAdminDateTime } from '../lib/formatDisplay'

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
          <dd class="text-slate-600">{{ formatAdminDateTime(device.last_seen_at as string) }}</dd>
        </div>
      </dl>
      <div v-if="(device.bindings as unknown[])?.length" class="mt-6">
        <h3 class="text-sm font-bold text-slate-800 mb-3">绑定用户</h3>
        <ul class="space-y-2">
          <li
            v-for="(b, i) in (device.bindings as Record<string, unknown>[])"
            :key="i"
            class="rounded-lg border border-slate-100 px-3 py-2.5 text-sm bg-slate-50/80 space-y-1.5"
          >
            <div class="flex flex-wrap gap-x-2 gap-y-0.5">
              <span class="text-slate-500 shrink-0">用户昵称</span>
              <span class="text-slate-900 font-medium">{{ (b.nickname as string) || '—' }}</span>
            </div>
            <div class="flex flex-wrap gap-x-2 gap-y-0.5">
              <span class="text-slate-500 shrink-0">绑定时间</span>
              <span class="text-slate-700 tabular-nums">{{ formatAdminDateTime(b.bound_at as string) }}</span>
            </div>
            <div class="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5 border-t border-slate-100/80 text-xs">
              <span class="text-slate-500">备注</span>
              <span class="text-slate-700">{{ (b.remark as string) || '—' }}</span>
              <span class="text-slate-300 mx-0.5">·</span>
              <span class="text-slate-500">角色</span>
              <span class="text-slate-600">{{ b.role }}</span>
            </div>
          </li>
        </ul>
      </div>
      <button type="button" class="mt-6 rounded-lg bg-[#2563eb] text-white px-5 py-2.5 text-sm font-semibold" @click="goLogs">
        查看操作日志
      </button>
    </div>
  </div>
</template>
