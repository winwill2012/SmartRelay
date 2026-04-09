<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getDashboardMetrics } from '../api/client'

const loading = ref(true)
const err = ref('')
const metrics = ref<Record<string, unknown>>({})
const range = ref('today')

const pills = [
  { id: 'today', label: '今日' },
  { id: 'week', label: '本周' },
  { id: 'month', label: '本月' },
  { id: 'd7', label: '近 7 日' },
  { id: 'd30', label: '近 30 日' }
]

async function load() {
  loading.value = true
  err.value = ''
  try {
    metrics.value = await getDashboardMetrics({ range: range.value })
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '加载失败'
    metrics.value = {}
  } finally {
    loading.value = false
  }
}

function setRange(id: string) {
  range.value = id
  load()
}

function num(k: string, fallback = '—') {
  const v = metrics.value[k]
  return v != null ? String(v) : fallback
}

onMounted(() => {
  load()
})
</script>

<template>
  <div class="mb-6 space-y-4">
    <div class="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
      <div>
        <p class="text-sm font-semibold text-slate-800">多维度运营概览</p>
        <p class="text-xs text-slate-500 mt-0.5">数据由服务端 /admin/dashboard/metrics 提供</p>
      </div>
      <div class="admin-time-pills" role="group">
        <button
          v-for="p in pills"
          :key="p.id"
          type="button"
          class="admin-time-pill"
          :class="{ 'is-active': range === p.id }"
          @click="setRange(p.id)"
        >
          {{ p.label }}
        </button>
      </div>
    </div>
    <p v-if="err" class="text-sm text-red-600">{{ err }}</p>
    <p v-if="loading" class="text-sm text-slate-500">加载中…</p>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">总设备数</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ num('total_devices') }}</p>
      <p class="mt-1.5 text-xs text-slate-500">累计接入设备</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">在线设备</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ num('online_devices') }}</p>
      <p class="mt-1.5 text-xs text-slate-500">实时在线</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">用户数</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ num('total_users') }}</p>
      <p class="mt-1.5 text-xs text-slate-500">注册用户</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">今日指令</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ num('commands_today') }}</p>
      <p class="mt-1.5 text-xs text-slate-500">下行指令次数</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">绑定关系</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ num('bindings') }}</p>
      <p class="mt-1.5 text-xs text-slate-500">用户-设备</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">固件版本</p>
      <p class="mt-3 text-xl font-bold text-slate-900 tabular-nums">{{ num('latest_firmware', '—') }}</p>
      <p class="mt-1.5 text-xs text-slate-500">最新活跃版本</p>
    </article>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div class="admin-card p-5">
      <p class="text-sm font-semibold text-slate-800 mb-3">趋势占位</p>
      <div class="admin-chart-area admin-chart-area--line h-48 flex items-center justify-center text-slate-400 text-sm">
        图表数据由后端 metrics 扩展后对接
      </div>
    </div>
    <div class="admin-card p-5">
      <p class="text-sm font-semibold text-slate-800 mb-3">在线分布占位</p>
      <div class="admin-chart-area h-48 flex items-center justify-center text-slate-400 text-sm">
        可与原型 dashboard 中 SVG 图表对齐
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
}
@media (min-width: 640px) {
  .sm\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 1024px) {
  .lg\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .lg\:grid-cols-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1280px) {
  .xl\:grid-cols-6 {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .xl\:flex-row {
    flex-direction: row;
  }
  .xl\:items-center {
    align-items: center;
  }
  .xl\:justify-between {
    justify-content: space-between;
  }
}
.flex-col {
  flex-direction: column;
}
.gap-4 {
  gap: 1rem;
}
.mb-6 {
  margin-bottom: 1.5rem;
}
.h-48 {
  height: 12rem;
}
</style>
