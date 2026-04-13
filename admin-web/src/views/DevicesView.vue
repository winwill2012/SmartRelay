<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { getAdminDevices, getAdminDevice, getAdminDeviceLogs } from '../api/client'
import AdminDateTimeRangePicker from '../components/AdminDateTimeRangePicker.vue'
import { formatAdminDateTime, logActionChip, formatLogSource } from '../lib/formatDisplay'

const loading = ref(true)
const err = ref('')
const q = ref('')
const lastStart = ref('')
const lastEnd = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const list = ref<Record<string, unknown>[]>([])

const detailOpen = ref(false)
const detailLoading = ref(false)
const detailErr = ref('')
const detailDevice = ref<Record<string, unknown> | null>(null)

const logsOpen = ref(false)
const logsLoading = ref(false)
const logsErr = ref('')
const logsList = ref<Record<string, unknown>[]>([])
const logsPk = ref<string | number | null>(null)
const logsDeviceLabel = ref('')
const logsPage = ref(1)
const logsPageSize = ref(20)
const logsTotal = ref(0)

const logsTotalPages = computed(() => Math.max(1, Math.ceil(logsTotal.value / logsPageSize.value)))

const detailDlgRef = ref<HTMLDialogElement | null>(null)
const logsDlgRef = ref<HTMLDialogElement | null>(null)

function onDetailDialogClose() {
  detailOpen.value = false
}

function onLogsDialogClose() {
  logsOpen.value = false
}

watch(detailOpen, async (v) => {
  await nextTick()
  const el = detailDlgRef.value
  if (!el) return
  if (v) {
    if (!el.open) el.showModal()
  } else if (el.open) {
    el.close()
  }
})

watch(logsOpen, async (v) => {
  await nextTick()
  const el = logsDlgRef.value
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
    const data = await getAdminDevices({
      page: page.value,
      page_size: pageSize.value,
      q: q.value.trim() || undefined,
      last_seen_start: lastStart.value || undefined,
      last_seen_end: lastEnd.value || undefined
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
  lastStart.value = ''
  lastEnd.value = ''
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

async function openDetail(row: Record<string, unknown>) {
  const id = row.id
  if (id == null) return
  logsDlgRef.value?.close()
  detailOpen.value = true
  detailLoading.value = true
  detailErr.value = ''
  detailDevice.value = null
  try {
    detailDevice.value = (await getAdminDevice(id as string | number)) as Record<string, unknown>
  } catch (e: unknown) {
    detailErr.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detailDlgRef.value?.close()
}

function onDetailBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) detailDlgRef.value?.close()
}

async function loadLogsPage() {
  if (logsPk.value == null) return
  logsLoading.value = true
  logsErr.value = ''
  try {
    const data = await getAdminDeviceLogs(logsPk.value, {
      page: logsPage.value,
      page_size: logsPageSize.value
    })
    const rows =
      (data as { items?: unknown[]; list?: unknown[] }).items ||
      (data as { list?: unknown[]; items?: unknown[] }).list ||
      []
    logsList.value = rows as Record<string, unknown>[]
    logsTotal.value = (data as { total?: number }).total ?? rows.length
  } catch (e: unknown) {
    logsErr.value = e instanceof Error ? e.message : '加载失败'
    logsList.value = []
  } finally {
    logsLoading.value = false
  }
}

async function openLogs(row: Record<string, unknown>) {
  const id = row.id
  if (id == null) return
  detailDlgRef.value?.close()
  logsPk.value = id as string | number
  logsDeviceLabel.value = String(row.device_id ?? id)
  logsPage.value = 1
  logsOpen.value = true
  await loadLogsPage()
}

function closeLogs() {
  logsDlgRef.value?.close()
}

function onLogsBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) logsDlgRef.value?.close()
}

function logsPrev() {
  if (logsPage.value > 1) {
    logsPage.value--
    loadLogsPage()
  }
}

function logsNext() {
  if (logsPage.value < logsTotalPages.value) {
    logsPage.value++
    loadLogsPage()
  }
}

function logActionForRow(row: Record<string, unknown>) {
  return logActionChip(row.action as string, row.detail)
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
        <label for="dev-name-q">备注名 / 设备编号</label>
        <input
          id="dev-name-q"
          v-model="q"
          type="search"
          class="admin-input-search"
          placeholder="搜索备注名或设备编号…"
          autocomplete="off"
          enterkeyhint="search"
          @keyup.enter="applyFilters"
        />
      </div>
      <div class="admin-filter-toolbar__ranges">
        <div class="admin-filter-inline-range">
          <span class="admin-filter-inline-range__label">最后上线时间</span>
          <AdminDateTimeRangePicker
            v-model:start="lastStart"
            v-model:end="lastEnd"
            start-placeholder="上线开始"
            end-placeholder="上线结束"
          />
        </div>
      </div>
      <div class="admin-filter-toolbar__actions">
        <button type="submit" class="admin-btn-toolbar admin-btn-toolbar--primary">查询</button>
        <button type="button" class="admin-btn-toolbar admin-btn-toolbar--ghost" @click="resetFilters">重置</button>
      </div>
    </div>
  </form>

  <p v-if="err" class="text-sm text-red-600 mb-2">{{ err }}</p>
  <p v-if="loading" class="text-sm text-slate-500 mb-2">加载中…</p>

  <div class="admin-table-wrap hidden md:block">
    <p class="admin-table-hint">「最近上线」为设备最后一次与云端通信时间（按日筛选为闭区间）。</p>
    <table class="min-w-[800px] w-full text-left text-sm">
      <thead class="text-slate-600 border-b border-slate-200">
        <tr>
          <th class="px-4 py-3 font-semibold">设备编号</th>
          <th class="px-4 py-3 font-semibold">备注名</th>
          <th class="px-4 py-3 font-semibold">在线</th>
          <th class="px-4 py-3 font-semibold">固件版本</th>
          <th class="px-4 py-3 font-semibold">所属用户</th>
          <th class="px-4 py-3 font-semibold">最近上线</th>
          <th class="px-4 py-3 font-semibold w-44">操作</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr v-for="row in list" :key="String(row.id)" class="hover:bg-slate-50/80">
          <td class="px-4 py-3 font-mono text-xs">{{ row.device_id }}</td>
          <td class="px-4 py-3">{{ (row.binding_remark as string) || '—' }}</td>
          <td class="px-4 py-3">
            <span :class="row.online ? 'text-emerald-600 font-medium' : 'text-slate-400'">
              {{ row.online ? '在线' : '离线' }}
            </span>
          </td>
          <td class="px-4 py-3 font-mono text-xs">{{ row.fw_version || '—' }}</td>
          <td class="px-4 py-3">{{ (row.owner_nickname as string) || '—' }}</td>
          <td class="px-4 py-3 text-slate-700 tabular-nums">{{ formatAdminDateTime(row.last_seen_at as string) }}</td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap gap-2">
              <button type="button" class="admin-table-action-btn" @click="openDetail(row)">详情</button>
              <button type="button" class="admin-table-action-btn admin-table-action-btn--muted" @click="openLogs(row)">
                日志
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="admin-pagination">
      <div class="flex items-center gap-2">
        <span>每页</span>
        <select v-model.number="pageSize" class="rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium" @change="onPageSizeChange">
          <option :value="5">5 条</option>
          <option :value="10">10 条</option>
          <option :value="20">20 条</option>
        </select>
      </div>
      <div class="admin-pagination__nav">
        <button type="button" class="admin-pagination__btn" :disabled="page <= 1" @click="goPrev">上一页</button>
        <span class="px-2 text-slate-600 tabular-nums">第 {{ page }} / {{ totalPages() }} 页</span>
        <button type="button" class="admin-pagination__btn" :disabled="page >= totalPages()" @click="goNext">下一页</button>
      </div>
      <span class="text-slate-500 tabular-nums">共 {{ total }} 条</span>
    </div>
  </div>

  <div class="space-y-3 md:hidden">
    <article v-for="row in list" :key="'m' + String(row.id)" class="admin-card p-4">
      <div class="flex justify-between items-start gap-2">
        <div class="min-w-0">
          <p class="font-mono text-xs text-slate-600">{{ row.device_id }}</p>
          <p class="font-semibold text-slate-900 mt-1">{{ (row.binding_remark as string) || '—' }}</p>
          <p class="text-xs text-slate-500 mt-1">
            {{ row.online ? '在线' : '离线' }} · {{ row.fw_version || '—' }} ·
            {{ formatAdminDateTime(row.last_seen_at as string) }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button type="button" class="admin-table-action-btn" @click="openDetail(row)">详情</button>
        <button type="button" class="admin-table-action-btn admin-table-action-btn--muted" @click="openLogs(row)">日志</button>
      </div>
    </article>
    <div class="admin-pagination">
      <div class="flex items-center gap-2">
        <span>每页</span>
        <select v-model.number="pageSize" class="rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium" @change="onPageSizeChange">
          <option :value="5">5 条</option>
          <option :value="10">10 条</option>
          <option :value="20">20 条</option>
        </select>
      </div>
      <div class="admin-pagination__nav">
        <button type="button" class="admin-pagination__btn" :disabled="page <= 1" @click="goPrev">上一页</button>
        <span class="px-2 text-slate-600 tabular-nums">第 {{ page }} / {{ totalPages() }} 页</span>
        <button type="button" class="admin-pagination__btn" :disabled="page >= totalPages()" @click="goNext">下一页</button>
      </div>
      <span class="text-slate-500 tabular-nums">共 {{ total }} 条</span>
    </div>
  </div>

  <!-- 设备详情：Teleport + showModal 视口居中 -->
  <Teleport to="body">
    <dialog
      ref="detailDlgRef"
      class="admin-dialog admin-dialog--sm border border-slate-200"
      @close="onDetailDialogClose"
      @click="onDetailBackdrop"
    >
    <div class="border-b border-slate-200 px-4 py-3 flex justify-between items-center bg-slate-50">
      <h2 class="text-sm font-semibold text-slate-900">设备详情</h2>
      <button type="button" class="text-slate-500 hover:text-slate-800 p-1 rounded" aria-label="关闭" @click="closeDetail">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="p-4 text-sm text-slate-700 max-h-[min(70vh,28rem)] overflow-y-auto">
      <p v-if="detailLoading" class="text-slate-500">加载中…</p>
      <p v-else-if="detailErr" class="text-red-600">{{ detailErr }}</p>
      <template v-else-if="detailDevice">
        <dl class="space-y-3">
          <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt class="text-slate-500 shrink-0">设备编号</dt>
            <dd class="font-mono text-slate-900 text-right break-all">{{ detailDevice.device_id }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt class="text-slate-500">在线</dt>
            <dd :class="detailDevice.online ? 'text-emerald-600 font-medium' : 'text-slate-400'">
              {{ detailDevice.online ? '在线' : '离线' }}
            </dd>
          </div>
          <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt class="text-slate-500">固件版本</dt>
            <dd class="font-mono">{{ detailDevice.fw_version || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt class="text-slate-500">MAC</dt>
            <dd class="font-mono text-xs">{{ detailDevice.mac || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt class="text-slate-500">最后上报</dt>
            <dd class="text-slate-600 tabular-nums text-right">
              {{ formatAdminDateTime(detailDevice.last_seen_at as string) }}
            </dd>
          </div>
        </dl>
        <div v-if="(detailDevice.bindings as unknown[])?.length" class="mt-4">
          <p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">绑定用户</p>
          <ul class="space-y-2">
            <li
              v-for="(b, i) in (detailDevice.bindings as Record<string, unknown>[])"
              :key="i"
              class="rounded-lg border border-slate-100 px-3 py-2 text-xs bg-slate-50/80"
            >
              <span class="text-slate-600">备注 {{ (b.remark as string) || '—' }}</span>
              <span class="text-slate-400 mx-1">·</span>
              <span class="text-slate-500">角色 {{ b.role }}</span>
            </li>
          </ul>
        </div>
      </template>
    </div>
    </dialog>
  </Teleport>

  <Teleport to="body">
    <dialog
      ref="logsDlgRef"
      class="admin-dialog admin-dialog--lg border border-slate-200"
      @close="onLogsDialogClose"
      @click="onLogsBackdrop"
    >
    <div class="border-b border-slate-200 px-4 py-3 flex justify-between items-center bg-slate-50 gap-2">
      <h2 class="text-sm font-semibold text-slate-900 min-w-0 truncate">操作日志 · {{ logsDeviceLabel }}</h2>
      <button type="button" class="text-slate-500 hover:text-slate-800 p-1 rounded shrink-0" aria-label="关闭" @click="closeLogs">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="p-4 text-sm max-h-[min(75vh,32rem)] overflow-hidden flex flex-col min-h-0">
      <p v-if="logsLoading" class="text-slate-500">加载中…</p>
      <p v-else-if="logsErr" class="text-red-600">{{ logsErr }}</p>
      <template v-else>
        <div class="overflow-x-auto overflow-y-auto flex-1 min-h-0 rounded-lg border border-slate-100">
          <table class="w-full text-sm min-w-[640px]">
            <thead class="sticky top-0 bg-slate-50 text-left text-slate-600 border-b border-slate-200">
              <tr>
                <th class="px-3 py-2 font-semibold whitespace-nowrap">时间</th>
                <th class="px-3 py-2 font-semibold">来源</th>
                <th class="px-3 py-2 font-semibold">动作</th>
                <th class="px-3 py-2 font-semibold">详情</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(logRow, idx) in logsList" :key="idx">
                <td class="px-3 py-2 text-slate-600 whitespace-nowrap tabular-nums">
                  {{ formatAdminDateTime(logRow.created_at as string) }}
                </td>
                <td class="px-3 py-2">{{ formatLogSource(logRow.source as string) }}</td>
                <td class="px-3 py-2">
                  <span :class="logActionForRow(logRow).chipClass">{{ logActionForRow(logRow).label }}</span>
                </td>
                <td class="px-3 py-2 text-xs text-slate-500 break-all max-w-xs">{{ JSON.stringify(logRow.detail || {}) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!logsList.length" class="p-6 text-center text-slate-500">暂无日志</p>
        </div>
        <div class="admin-pagination mt-3 rounded-lg border border-slate-100 !border-t">
          <div class="admin-pagination__nav">
            <button type="button" class="admin-pagination__btn" :disabled="logsPage <= 1" @click="logsPrev">上一页</button>
            <span class="px-2 text-slate-600 tabular-nums">第 {{ logsPage }} / {{ logsTotalPages }} 页</span>
            <button type="button" class="admin-pagination__btn" :disabled="logsPage >= logsTotalPages" @click="logsNext">
              下一页
            </button>
          </div>
          <span class="text-slate-500 tabular-nums">共 {{ logsTotal }} 条</span>
        </div>
      </template>
    </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.flex {
  display: flex;
}
.flex-col {
  flex-direction: column;
}
.flex-wrap {
  flex-wrap: wrap;
}
.flex-1 {
  flex: 1 1 0%;
}
.items-center {
  align-items: center;
}
.justify-between {
  justify-content: space-between;
}
.gap-2 {
  gap: 0.5rem;
}
.mb-2 {
  margin-bottom: 0.5rem;
}
.mt-3 {
  margin-top: 0.75rem;
}
.mt-1 {
  margin-top: 0.25rem;
}
.mt-4 {
  margin-top: 1rem;
}
.min-w-0 {
  min-width: 0;
}
.min-h-0 {
  min-height: 0;
}
.space-y-3 > * + * {
  margin-top: 0.75rem;
}
.space-y-2 > * + * {
  margin-top: 0.5rem;
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
.shrink-0 {
  flex-shrink: 0;
}
.break-all {
  word-break: break-all;
}
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-primary {
  color: #2563eb;
}
</style>
