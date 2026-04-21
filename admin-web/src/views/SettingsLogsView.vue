<script setup lang="ts">
import { ref, watch } from 'vue'
import { getAdminLoginLogs, getAdminOperationLogs, type AdminLoginLogRow, type AdminOperationLogRow } from '../api/client'
import { formatAdminDateTime } from '../lib/formatDisplay'

const tab = ref<'login' | 'op'>('login')
const loading = ref(false)
const err = ref('')

const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const loginItems = ref<AdminLoginLogRow[]>([])
const opItems = ref<AdminOperationLogRow[]>([])

async function load() {
  loading.value = true
  err.value = ''
  try {
    if (tab.value === 'login') {
      const d = await getAdminLoginLogs({ page: page.value, page_size: pageSize.value })
      loginItems.value = d.items
      total.value = d.total
    } else {
      const d = await getAdminOperationLogs({ page: page.value, page_size: pageSize.value })
      opItems.value = d.items
      total.value = d.total
    }
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function setTab(t: 'login' | 'op') {
  tab.value = t
  page.value = 1
}

watch([tab, page], () => {
  void load()
}, { immediate: true })
</script>

<template>
  <div class="flex flex-wrap gap-2 mb-4">
    <button
      type="button"
      class="rounded-lg px-4 py-2 text-sm font-semibold border transition-colors"
      :class="
        tab === 'login'
          ? 'bg-primary text-white border-primary'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
      "
      @click="setTab('login')"
    >
      登录日志
    </button>
    <button
      type="button"
      class="rounded-lg px-4 py-2 text-sm font-semibold border transition-colors"
      :class="
        tab === 'op'
          ? 'bg-primary text-white border-primary'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
      "
      @click="setTab('op')"
    >
      操作日志
    </button>
  </div>

  <p v-if="err" class="text-sm text-red-600 mb-3">{{ err }}</p>
  <p v-if="loading" class="text-sm text-slate-500 mb-4">加载中…</p>

  <section v-else class="admin-card p-0 overflow-hidden">
    <template v-if="tab === 'login'">
      <div class="admin-table-wrap">
        <table class="min-w-[720px] w-full text-left text-sm">
          <thead class="bg-slate-50 text-slate-600 border-y border-slate-200">
            <tr>
              <th class="px-4 py-3 font-semibold">时间</th>
              <th class="px-4 py-3 font-semibold">账号</th>
              <th class="px-4 py-3 font-semibold">结果</th>
              <th class="px-4 py-3 font-semibold">IP</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="row in loginItems" :key="row.id" class="hover:bg-slate-50/80">
              <td class="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">
                {{ formatAdminDateTime(row.created_at) }}
              </td>
              <td class="px-4 py-3">{{ row.username || '—' }}</td>
              <td class="px-4 py-3">
                <span
                  class="text-xs font-semibold"
                  :class="row.success ? 'text-emerald-600' : 'text-red-600'"
                >
                  {{ row.success ? '成功' : row.fail_reason || '失败' }}
                </span>
              </td>
              <td class="px-4 py-3 text-slate-600 font-mono text-xs">{{ row.ip || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!loginItems.length" class="text-sm text-slate-500 py-8 text-center">暂无记录</p>
      </div>
    </template>

    <template v-else>
      <div class="admin-table-wrap">
        <table class="min-w-[900px] w-full text-left text-sm">
          <thead class="bg-slate-50 text-slate-600 border-y border-slate-200">
            <tr>
              <th class="px-4 py-3 font-semibold">时间</th>
              <th class="px-4 py-3 font-semibold">账号</th>
              <th class="px-4 py-3 font-semibold">方法</th>
              <th class="px-4 py-3 font-semibold">路径</th>
              <th class="px-4 py-3 font-semibold">状态</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="row in opItems" :key="row.id" class="hover:bg-slate-50/80">
              <td class="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">
                {{ formatAdminDateTime(row.created_at) }}
              </td>
              <td class="px-4 py-3">{{ row.username || '—' }}</td>
              <td class="px-4 py-3 font-mono text-xs">{{ row.method }}</td>
              <td class="px-4 py-3 font-mono text-xs break-all">{{ row.path }}</td>
              <td class="px-4 py-3 tabular-nums">{{ row.status_code ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!opItems.length" class="text-sm text-slate-500 py-8 text-center">暂无记录</p>
      </div>
    </template>

    <div v-if="total > pageSize" class="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-600">
      <span>共 {{ total }} 条</span>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          :disabled="page <= 1"
          @click="page--"
        >
          上一页
        </button>
        <button
          type="button"
          class="rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          :disabled="page * pageSize >= total"
          @click="page++"
        >
          下一页
        </button>
      </div>
    </div>
  </section>
</template>
