<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAdminUsers, getAdminUser } from '../api/client'

const loading = ref(true)
const err = ref('')
const q = ref('')
const regStart = ref('')
const regEnd = ref('')
const loginStart = ref('')
const loginEnd = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const list = ref<Record<string, unknown>[]>([])

const dlgOpen = ref(false)
const dlgLoading = ref(false)
const dlgErr = ref('')
const dlgUserLabel = ref('')
const dlgDevices = ref<{ device_id: string; remark?: string; online?: boolean }[]>([])

async function load() {
  loading.value = true
  err.value = ''
  try {
    const data = await getAdminUsers({
      page: page.value,
      page_size: pageSize.value,
      q: q.value.trim() || undefined,
      reg_start: regStart.value || undefined,
      reg_end: regEnd.value || undefined,
      login_start: loginStart.value || undefined,
      login_end: loginEnd.value || undefined
    })
    const rows =
      (data as { list?: unknown[]; items?: unknown[] }).list ||
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

function applyFilters(e?: Event) {
  e?.preventDefault()
  page.value = 1
  load()
}

function resetFilters() {
  q.value = ''
  regStart.value = ''
  regEnd.value = ''
  loginStart.value = ''
  loginEnd.value = ''
  page.value = 1
  load()
}

const totalPages = () => Math.max(1, Math.ceil(total.value / pageSize.value))

function goPrev() {
  if (page.value > 1) {
    page.value--
    load()
  }
}

function goNext() {
  if (page.value < totalPages()) {
    page.value++
    load()
  }
}

function onPageSizeChange() {
  page.value = 1
  load()
}

function devBadgeClass(n: number) {
  return n >= 2
    ? 'inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary'
    : 'inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700'
}

async function openDevices(row: Record<string, unknown>) {
  const uid = row.id
  if (uid == null) return
  dlgOpen.value = true
  dlgLoading.value = true
  dlgErr.value = ''
  dlgUserLabel.value = String(row.nickname || row.openid || uid)
  dlgDevices.value = []
  try {
    const detail = (await getAdminUser(uid as string | number)) as {
      devices?: { device_id: string; remark?: string; online?: boolean }[]
    }
    dlgDevices.value = detail.devices || []
  } catch (e: unknown) {
    dlgErr.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    dlgLoading.value = false
  }
}

function closeDlg() {
  dlgOpen.value = false
}

function rowDate(s: string) {
  return s.slice(0, 10)
}

onMounted(() => {
  load()
})
</script>

<template>
  <form class="admin-card admin-filter-panel" action="javascript:void(0)" novalidate @submit="applyFilters">
    <div class="admin-filter-panel__body">
      <div class="admin-filter-panel__row admin-filter-panel__row--split">
        <div class="min-w-0">
          <label for="user-search" class="block text-xs font-bold text-slate-600 mb-1.5">昵称</label>
          <input
            id="user-search"
            v-model="q"
            type="search"
            class="admin-input-search max-w-xl"
            placeholder="搜索用户昵称…"
            autocomplete="off"
            enterkeyhint="search"
            @keyup.enter="applyFilters"
          />
        </div>
        <div class="admin-filter-actions">
          <button
            type="submit"
            class="admin-btn-primary rounded-lg bg-primary text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-blue-500/20 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            应用筛选
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
            @click="resetFilters"
          >
            清空条件
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <fieldset class="admin-filter-fieldset">
          <legend>注册时间</legend>
          <div class="admin-date-range" role="group" aria-label="注册时间范围">
            <input v-model="regStart" type="date" aria-label="注册开始日期" />
            <span class="admin-date-range__sep">至</span>
            <input v-model="regEnd" type="date" aria-label="注册结束日期" />
          </div>
        </fieldset>
        <fieldset class="admin-filter-fieldset">
          <legend>最后登录</legend>
          <div class="admin-date-range" role="group" aria-label="最后登录时间范围">
            <input v-model="loginStart" type="date" aria-label="登录开始日期" />
            <span class="admin-date-range__sep">至</span>
            <input v-model="loginEnd" type="date" aria-label="登录结束日期" />
          </div>
        </fieldset>
      </div>
    </div>
  </form>

  <p v-if="err" class="text-sm text-red-600 mb-2 mt-4">{{ err }}</p>
  <p v-if="loading" class="text-sm text-slate-500 mb-2 mt-4">加载中…</p>

  <div class="admin-table-wrap hidden md:block mt-4">
    <p class="admin-table-hint">昵称与账号标识已按合规要求脱敏展示。</p>
    <table class="min-w-[720px] w-full text-left text-sm">
      <thead class="text-slate-600 border-b border-slate-200">
        <tr>
          <th class="px-4 py-3 font-semibold">用户</th>
          <th class="px-4 py-3 font-semibold">注册时间</th>
          <th class="px-4 py-3 font-semibold">最后登录</th>
          <th class="px-4 py-3 font-semibold">名下设备</th>
          <th class="px-4 py-3 font-semibold w-28">操作</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr v-for="row in list" :key="String(row.id)" class="hover:bg-slate-50/80">
          <td class="px-4 py-3">
            <span class="font-medium text-slate-900">{{ row.nickname || '—' }}</span>
          </td>
          <td class="px-4 py-3 text-slate-700 tabular-nums">{{ row.created_at || '—' }}</td>
          <td class="px-4 py-3 text-slate-700 tabular-nums">{{ row.last_login_at || '—' }}</td>
          <td class="px-4 py-3">
            <span :class="devBadgeClass(Number(row.device_bindings) || 0)">
              {{ Number(row.device_bindings) || 0 }} 台
            </span>
          </td>
          <td class="px-4 py-3">
            <button type="button" class="text-primary text-sm font-semibold hover:underline" @click="openDevices(row)">
              查看设备
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="admin-pagination">
      <div class="flex items-center gap-2">
        <span>每页</span>
        <select          v-model.number="pageSize"
          class="rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium"
          @change="onPageSizeChange"
        >
          <option :value="5">5 条</option>
          <option :value="10">10 条</option>
          <option :value="20">20 条</option>
          <option :value="50">50 条</option>
        </select>
      </div>
      <div class="admin-pagination__nav">
        <button type="button" class="admin-pagination__btn" aria-label="上一页" :disabled="page <= 1" @click="goPrev">
          上一页
        </button>
        <span class="px-2 text-slate-600 tabular-nums">第 {{ page }} / {{ totalPages() }} 页</span>
        <button          type="button"
          class="admin-pagination__btn"
          aria-label="下一页"
          :disabled="page >= totalPages()"
          @click="goNext"
        >
          下一页
        </button>
      </div>
      <span class="text-slate-500 tabular-nums">共 {{ total }} 条</span>
    </div>
  </div>

  <div class="space-y-3 md:hidden mt-4">
    <article v-for="row in list" :key="'m' + String(row.id)" class="admin-card p-4">
      <div class="flex justify-between items-start gap-2">
        <div>
          <p class="font-semibold text-slate-900">{{ row.nickname || '—' }}</p>
          <p class="text-xs text-slate-500 mt-1">
            注册 {{ row.created_at ? rowDate(String(row.created_at)) : '—' }} · 最后登录
            {{ row.last_login_at ? rowDate(String(row.last_login_at)) : '—' }}
          </p>
        </div>
        <span class="shrink-0 text-sm font-semibold text-primary">{{ Number(row.device_bindings) || 0 }} 台</span>
      </div>
      <button type="button" class="mt-3 text-sm text-primary font-semibold" @click="openDevices(row)">查看名下设备</button>
    </article>
    <div class="admin-pagination">
      <div class="flex items-center gap-2">
        <span>每页</span>
        <select          v-model.number="pageSize"
          class="rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium"
          @change="onPageSizeChange"
        >
          <option :value="5">5 条</option>
          <option :value="10">10 条</option>
          <option :value="20">20 条</option>
        </select>
      </div>
      <div class="admin-pagination__nav">
        <button type="button" class="admin-pagination__btn" :disabled="page <= 1" @click="goPrev">上一页</button>
        <span class="px-2 text-slate-600 tabular-nums">第 {{ page }} / {{ totalPages() }} 页</span>
        <button type="button" class="admin-pagination__btn" :disabled="page >= totalPages()" @click="goNext">
          下一页
        </button>
      </div>
      <span class="text-slate-500 tabular-nums">共 {{ total }} 条</span>
    </div>
  </div>

  <dialog
    class="admin-dialog rounded-xl border border-slate-200 p-0 shadow-xl max-w-md w-[calc(100%-2rem)]"
    :open="dlgOpen"
    @click="(e) => (e.target as HTMLDialogElement) === e.currentTarget && closeDlg()"
  >
    <div class="border-b border-slate-200 px-4 py-3 flex justify-between items-center bg-slate-50">
      <h2 class="text-sm font-semibold text-slate-900">名下设备 · {{ dlgUserLabel }}</h2>
      <button type="button" class="text-slate-500 hover:text-slate-800 p-1 rounded" aria-label="关闭" @click="closeDlg">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="p-4 text-sm text-slate-700 max-h-[60vh] overflow-y-auto">
      <p v-if="dlgLoading" class="text-slate-500">加载中…</p>
      <p v-else-if="dlgErr" class="text-red-600">{{ dlgErr }}</p>
      <ul v-else class="space-y-2">
        <li
          v-for="(d, i) in dlgDevices"
          :key="i"
          class="flex justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2"
        >
          <span>{{ d.remark || d.device_id }}</span>
          <span :class="d.online ? 'text-xs text-emerald-600' : 'text-xs text-slate-500'">
            {{ d.online ? '在线' : '离线' }}
          </span>
        </li>
        <li v-if="!dlgDevices.length" class="text-slate-500">暂无绑定设备</li>
      </ul>
    </div>
  </dialog>
</template>

<style scoped>
.grid {
  display: grid;
}
@media (min-width: 1024px) {
  .lg\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.gap-4 {
  gap: 1rem;
}
.flex {
  display: flex;
}
.items-center {
  align-items: center;
}
.gap-2 {
  gap: 0.5rem;
}
.mt-4 {
  margin-top: 1rem;
}
.mt-3 {
  margin-top: 0.75rem;
}
.mt-1 {
  margin-top: 0.25rem;
}
.mb-2 {
  margin-bottom: 0.5rem;
}
.mb-1\.5 {
  margin-bottom: 0.375rem;
}
.space-y-3 > * + * {
  margin-top: 0.75rem;
}
.space-y-2 > * + * {
  margin-top: 0.5rem;
}
.min-w-0 {
  min-width: 0;
}
.max-w-xl {
  max-width: 36rem;
}
.shrink-0 {
  flex-shrink: 0;
}
.hidden {
  display: none;
}
@media (min-width: 768px) {
  .md\:block {
    display: block;
  }
  .md\:hidden {
    display: none;
  }
}
.bg-primary {
  background-color: #2563eb;
}
.text-primary {
  color: #2563eb;
}
</style>
