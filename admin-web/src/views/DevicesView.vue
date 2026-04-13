<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getAdminDevices } from '../api/client'

const router = useRouter()
const loading = ref(true)
const err = ref('')
const q = ref('')
const lastStart = ref('')
const lastEnd = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const list = ref<Record<string, unknown>[]>([])

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

function goDetail(row: Record<string, unknown>) {
  const id = row.id
  router.push(`/devices/${encodeURIComponent(String(id))}`)
}

onMounted(() => {
  load()
})
</script>

<template>
  <form class="admin-card admin-filter-panel mb-4" action="javascript:void(0)" novalidate @submit="applyFilters">
    <div class="admin-filter-panel__body">
      <div class="admin-filter-panel__row admin-filter-panel__row--split">
        <div class="min-w-0">
          <label for="dev-name-q" class="block text-xs font-bold text-slate-600 mb-1.5">备注名 / 设备编号</label>
          <input
            id="dev-name-q"
            v-model="q"
            type="search"
            class="admin-input-search max-w-xl"
            placeholder="搜索备注名或设备编号…"
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

      <fieldset class="admin-filter-fieldset max-w-2xl">
        <legend>最后上线时间</legend>
        <div class="admin-date-range" role="group" aria-label="最后上线时间范围">
          <input v-model="lastStart" type="date" aria-label="最后上线开始日期" />
          <span class="admin-date-range__sep">至</span>
          <input v-model="lastEnd" type="date" aria-label="最后上线结束日期" />
        </div>
      </fieldset>
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
          <th class="px-4 py-3 font-semibold w-36">操作</th>
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
          <td class="px-4 py-3 text-slate-700 tabular-nums">{{ row.last_seen_at || '—' }}</td>
          <td class="px-4 py-3">
            <button type="button" class="text-primary text-sm font-semibold hover:underline" @click="goDetail(row)">
              详情 / 日志
            </button>
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
            {{ row.online ? '在线' : '离线' }} · {{ row.fw_version || '—' }} · {{ row.last_seen_at || '—' }}
          </p>
        </div>
      </div>
      <button type="button" class="mt-3 text-sm text-primary font-semibold" @click="goDetail(row)">详情 / 日志</button>
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
.mb-4 {
  margin-bottom: 1rem;
}
.mb-2 {
  margin-bottom: 0.5rem;
}
.mb-1\.5 {
  margin-bottom: 0.375rem;
}
.mt-3 {
  margin-top: 0.75rem;
}
.mt-1 {
  margin-top: 0.25rem;
}
.min-w-0 {
  min-width: 0;
}
.max-w-xl {
  max-width: 36rem;
}
.max-w-2xl {
  max-width: 42rem;
}
.space-y-3 > * + * {
  margin-top: 0.75rem;
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
