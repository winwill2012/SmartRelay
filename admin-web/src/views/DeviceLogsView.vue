<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getAdminDeviceLogs } from '../api/client'

const route = useRoute()
const loading = ref(true)
const err = ref('')
const list = ref<Record<string, unknown>[]>([])
const page = ref(1)

async function load() {
  loading.value = true
  err.value = ''
  try {
    const data = await getAdminDeviceLogs(route.params.id as string, {
      page: page.value,
      page_size: 30
    })
    const rows = (data as { list?: unknown[]; items?: unknown[] }).list ||
      (data as { list?: unknown[]; items?: unknown[] }).items ||
      (Array.isArray(data) ? data : [])
    list.value = rows as Record<string, unknown>[]
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '加载失败'
    list.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    page.value = 1
    load()
  },
  { immediate: true }
)
</script>

<template>
  <div class="admin-card p-5">
    <h2 class="text-lg font-bold text-slate-900 mb-4">设备操作日志</h2>
    <p v-if="loading" class="text-slate-500">加载中…</p>
    <p v-else-if="err" class="text-red-600">{{ err }}</p>
    <div v-else class="admin-table-wrap">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-600">
            <th class="px-3 py-2">时间</th>
            <th class="px-3 py-2">来源</th>
            <th class="px-3 py-2">动作</th>
            <th class="px-3 py-2">详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in list" :key="idx" class="border-t border-slate-100">
            <td class="px-3 py-2 text-slate-600 whitespace-nowrap">{{ row.created_at }}</td>
            <td class="px-3 py-2">{{ row.source }}</td>
            <td class="px-3 py-2">{{ row.action }}</td>
            <td class="px-3 py-2 text-xs text-slate-500">{{ JSON.stringify(row.detail || {}) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="admin-pagination">
        <button type="button" class="admin-pagination__btn" :disabled="page <= 1" @click="page--; load()">上一页</button>
        <button type="button" class="admin-pagination__btn" @click="page++; load()">下一页</button>
      </div>
    </div>
  </div>
</template>
