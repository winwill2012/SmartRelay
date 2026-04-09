<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getAdminDevices } from '../api/client'

const router = useRouter()
const loading = ref(true)
const err = ref('')
const q = ref('')
const page = ref(1)
const total = ref(0)
const list = ref<Record<string, unknown>[]>([])

async function load() {
  loading.value = true
  err.value = ''
  try {
    const data = await getAdminDevices({ page: page.value, page_size: 20, q: q.value || undefined })
    const rows = (data as { list?: unknown[]; items?: unknown[] }).list ||
      (data as { list?: unknown[]; items?: unknown[] }).items ||
      []
    list.value = rows as Record<string, unknown>[]
    total.value = (data as { total?: number }).total ?? rows.length
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '加载失败'
    list.value = []
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function goDetail(row: Record<string, unknown>) {
  const id = row.id ?? row.device_id
  router.push(`/devices/${encodeURIComponent(String(id))}`)
}

onMounted(() => {
  load()
})
</script>

<template>
  <div class="admin-filter-panel admin-card mb-4">
    <div class="admin-filter-panel__head">
      <p class="admin-filter-panel__title">设备管理</p>
      <p class="admin-filter-panel__desc">device_id、在线状态、固件版本等</p>
    </div>
    <div class="admin-filter-panel__body">
      <div class="admin-filter-panel__row admin-filter-panel__row--split">
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">搜索</label>
          <input v-model="q" type="search" class="admin-input-search w-full max-w-xl" placeholder="device_id / MAC" @keyup.enter="search" />
        </div>
        <div class="admin-filter-actions">
          <button type="button" class="rounded-lg bg-[#2563eb] text-white px-5 py-2.5 text-sm font-semibold shadow-md" @click="search">
            查询
          </button>
        </div>
      </div>
    </div>
  </div>

  <p v-if="err" class="text-sm text-red-600 mb-2">{{ err }}</p>
  <p v-if="loading" class="text-sm text-slate-500 mb-2">加载中…</p>

  <div class="admin-table-wrap">
    <div class="admin-table-hint">共 {{ total }} 台</div>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-slate-600">
          <th class="px-4 py-3">ID</th>
          <th class="px-4 py-3">device_id</th>
          <th class="px-4 py-3">在线</th>
          <th class="px-4 py-3">固件</th>
          <th class="px-4 py-3">最后上报</th>
          <th class="px-4 py-3">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in list" :key="String(row.id ?? row.device_id)" class="border-t border-slate-100">
          <td class="px-4 py-3 font-mono text-xs">{{ row.id }}</td>
          <td class="px-4 py-3 font-mono text-xs">{{ row.device_id }}</td>
          <td class="px-4 py-3">
            <span :class="row.online ? 'text-emerald-600' : 'text-slate-400'">{{ row.online ? '在线' : '离线' }}</span>
          </td>
          <td class="px-4 py-3">{{ row.fw_version || '—' }}</td>
          <td class="px-4 py-3 text-slate-600">{{ row.last_seen_at || '—' }}</td>
          <td class="px-4 py-3">
            <button type="button" class="text-[#2563eb] font-medium" @click="goDetail(row)">详情</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="admin-pagination">
      <span>第 {{ page }} 页</span>
      <div class="admin-pagination__nav">
        <button type="button" class="admin-pagination__btn" :disabled="page <= 1" @click="page--; load()">上一页</button>
        <button type="button" class="admin-pagination__btn" @click="page++; load()">下一页</button>
      </div>
    </div>
  </div>
</template>
