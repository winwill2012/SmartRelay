<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { getAdminUsers, getAdminUser } from '../api/client'
import AdminDateTimeRangePicker from '../components/AdminDateTimeRangePicker.vue'
import { formatAdminDateTime } from '../lib/formatDisplay'

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
const dlgDevices = ref<
  {
    device_id: string
    remark?: string
    display_name?: string
    role?: string
    online?: boolean
    bound_at?: string | null
  }[]
>([])
const dlgRef = ref<HTMLDialogElement | null>(null)
const copiedDeviceId = ref<string | null>(null)
let copyDeviceIdTimer: ReturnType<typeof setTimeout> | null = null

async function copyDeviceId(deviceId: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(deviceId)
    } else {
      const ta = document.createElement('textarea')
      ta.value = deviceId
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (!ok) throw new Error('copy failed')
    }
    copiedDeviceId.value = deviceId
    if (copyDeviceIdTimer) clearTimeout(copyDeviceIdTimer)
    copyDeviceIdTimer = setTimeout(() => {
      copiedDeviceId.value = null
    }, 2000)
  } catch {
    window.alert('复制失败，请手动选择设备 ID 或检查浏览器权限')
  }
}

function onDlgClose() {
  dlgOpen.value = false
  copiedDeviceId.value = null
}

watch(dlgOpen, async (v) => {
  await nextTick()
  const el = dlgRef.value
  if (!el) return
  if (v) {
    if (!el.open) el.showModal()
  } else if (el.open) {
    el.close()
  }
})

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
      devices?: {
        device_id: string
        remark?: string
        display_name?: string
        role?: string
        online?: boolean
        bound_at?: string | null
      }[]
    }
    dlgDevices.value = detail.devices || []
  } catch (e: unknown) {
    dlgErr.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    dlgLoading.value = false
  }
}

function closeDlg() {
  dlgRef.value?.close()
}

function onDlgBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) dlgRef.value?.close()
}

onMounted(() => {
  load()
})
</script>

<template>
  <form
    class="admin-card admin-filter-panel admin-filter-panel--toolbar"
    action="javascript:void(0)"
    novalidate
    @submit="applyFilters"
  >
    <div class="admin-filter-toolbar">
      <div class="admin-filter-toolbar__search">
        <label for="user-search">昵称</label>
        <input
          id="user-search"
          v-model="q"
          type="search"
          class="admin-input-search"
          placeholder="搜索用户昵称…"
          autocomplete="off"
          enterkeyhint="search"
          @keyup.enter="applyFilters"
        />
      </div>
      <div class="admin-filter-toolbar__ranges">
        <div class="admin-filter-inline-range">
          <span class="admin-filter-inline-range__label">注册时间</span>
          <AdminDateTimeRangePicker
            v-model:start="regStart"
            v-model:end="regEnd"
            start-placeholder="注册开始"
            end-placeholder="注册结束"
          />
        </div>
        <div class="admin-filter-inline-range">
          <span class="admin-filter-inline-range__label">最后登录</span>
          <AdminDateTimeRangePicker
            v-model:start="loginStart"
            v-model:end="loginEnd"
            start-placeholder="登录开始"
            end-placeholder="登录结束"
          />
        </div>
      </div>
      <div class="admin-filter-toolbar__actions">
        <button type="submit" class="admin-btn-toolbar admin-btn-toolbar--primary">查询</button>
        <button type="button" class="admin-btn-toolbar admin-btn-toolbar--ghost" @click="resetFilters">重置</button>
      </div>
    </div>
  </form>

  <p v-if="err" class="text-sm text-red-600 mb-2 mt-4">{{ err }}</p>
  <p v-if="loading" class="text-sm text-slate-500 mb-2 mt-4">加载中…</p>

  <div class="admin-table-wrap hidden md:block mt-4">
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
          <td class="px-4 py-3 text-slate-700 tabular-nums">{{ formatAdminDateTime(row.created_at as string) }}</td>
          <td class="px-4 py-3 text-slate-700 tabular-nums">{{ formatAdminDateTime(row.last_login_at as string) }}</td>
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
            注册 {{ formatAdminDateTime(row.created_at as string) }} · 最后登录
            {{ formatAdminDateTime(row.last_login_at as string) }}
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

  <Teleport to="body">
    <dialog
      ref="dlgRef"
      class="admin-dialog admin-dialog--sm border border-slate-200"
      @close="onDlgClose"
      @click="onDlgBackdrop"
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
          :key="d.device_id + '-' + i"
          class="flex justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2.5"
        >
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2 min-w-0">
              <p class="font-medium text-slate-900 truncate">
                {{ d.display_name || (d.remark && d.remark.trim()) || d.device_id }}
              </p>
              <span
                v-if="d.role === 'shared'"
                class="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800"
              >分享</span>
            </div>
            <p class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 tabular-nums">
              <span class="text-slate-400 shrink-0">设备 ID</span>
              <span class="min-w-0 break-all font-mono text-slate-700">{{ d.device_id }}</span>
              <button
                type="button"
                class="user-dev-copy-id inline-flex shrink-0 items-center justify-center rounded border border-slate-200 bg-white p-0.5 text-slate-500 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                title="复制设备 ID"
                aria-label="复制设备 ID"
                @click="copyDeviceId(d.device_id)"
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
              <span v-if="copiedDeviceId === d.device_id" class="text-[10px] font-medium text-emerald-600">已复制</span>
            </p>
            <p class="text-xs text-slate-500 tabular-nums">
              <span class="text-slate-400">绑定时间</span>
              {{ formatAdminDateTime(d.bound_at) }}
            </p>
          </div>
          <span
            class="shrink-0 self-start text-xs font-medium"
            :class="d.online ? 'text-emerald-600' : 'text-slate-500'"
          >
            {{ d.online ? '在线' : '离线' }}
          </span>
        </li>
        <li v-if="!dlgDevices.length" class="text-slate-500">暂无绑定设备</li>
      </ul>
    </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
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
.space-y-3 > * + * {
  margin-top: 0.75rem;
}
.space-y-2 > * + * {
  margin-top: 0.5rem;
}
.space-y-1 > * + * {
  margin-top: 0.25rem;
}
.min-w-0 {
  min-width: 0;
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
