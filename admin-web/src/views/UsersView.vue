<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAdminUsers } from '../api/client'

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
    const data = await getAdminUsers({ page: page.value, page_size: 20, q: q.value || undefined })
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

onMounted(() => {
  load()
})
</script>

<template>
  <div class="admin-filter-panel admin-card mb-4">
    <div class="admin-filter-panel__head">
      <p class="admin-filter-panel__title">用户管理</p>
      <p class="admin-filter-panel__desc">注册时间、最后登录、名下设备等字段由服务端返回</p>
    </div>
    <div class="admin-filter-panel__body">
      <div class="admin-filter-panel__row admin-filter-panel__row--split">
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">搜索</label>
          <input v-model="q" type="search" class="admin-input-search w-full max-w-xl" placeholder="openid / 昵称" @keyup.enter="search" />
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
    <div class="admin-table-hint">共 {{ total }} 条</div>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-slate-600">
          <th class="px-4 py-3">ID</th>
          <th class="px-4 py-3">昵称</th>
          <th class="px-4 py-3">OpenID</th>
          <th class="px-4 py-3">注册时间</th>
          <th class="px-4 py-3">最后登录</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in list" :key="String(row.id ?? row.openid)" class="border-t border-slate-100">
          <td class="px-4 py-3 font-mono text-xs">{{ row.id }}</td>
          <td class="px-4 py-3">{{ row.nickname || '—' }}</td>
          <td class="px-4 py-3 font-mono text-xs truncate max-w-xs">{{ row.openid }}</td>
          <td class="px-4 py-3 text-slate-600">{{ row.created_at || '—' }}</td>
          <td class="px-4 py-3 text-slate-600">{{ row.last_login_at || '—' }}</td>
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

<style scoped>
.w-full {
  width: 100%;
}
.max-w-xl {
  max-width: 36rem;
}
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
