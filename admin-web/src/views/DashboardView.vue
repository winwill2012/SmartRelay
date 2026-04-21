<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getDashboardMetrics } from '../api/client'
import AdminDateTimeRangePicker from '../components/AdminDateTimeRangePicker.vue'
import { buildLineChart, barHeights, buildAxisDisplayLabels } from '../lib/dashboardCharts'

type PeriodId = 'today' | 'week' | 'month' | 'year' | 'd7' | 'd30'

type ChartsPayload = {
  labels: string[]
  online_count: number[]
  new_users: number[]
  new_devices: number[]
  commands: number[]
  captions?: { line?: string; users?: string; devices?: string; commands?: string }
}

const loading = ref(true)
const err = ref('')
const metrics = ref<Record<string, unknown>>({})

const activePill = ref<PeriodId | 'custom'>('today')
const apiPeriod = ref<PeriodId>('today')
const customRangeActive = ref(false)

const customPanelOpen = ref(false)
const rangeStart = ref('')
const rangeEnd = ref('')

const pills: { id: PeriodId; label: string }[] = [
  { id: 'today', label: '今日' },
  { id: 'week', label: '本周' },
  { id: 'month', label: '本月' },
  { id: 'year', label: '本年' },
  { id: 'd7', label: '近 7 日' },
  { id: 'd30', label: '近 30 日' }
]

const periodLabel: Record<PeriodId, string> = {
  today: '今日',
  week: '本周',
  month: '本月',
  year: '本年',
  d7: '近 7 日',
  d30: '近 30 日'
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function fmtDashDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function initDateInputs() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 6)
  rangeStart.value = `${fmtDashDate(start)}T00:00:00`
  rangeEnd.value = `${fmtDashDate(end)}T23:59:59`
}

const charts = computed(() => (metrics.value.charts as ChartsPayload | undefined) ?? null)

const chartLabels = computed(() => {
  const c = charts.value
  return c?.labels?.length ? c.labels : ['—']
})

/** 柱图横轴：稀疏 + 缩写，避免「本月」多日重叠 */
const chartLabelsDisplay = computed(() =>
  buildAxisDisplayLabels(charts.value?.labels, chartLabels.value.length, 11)
)

const lineValues = computed(() => {
  const c = charts.value
  const v = c?.online_count
  return v?.length ? v : [0]
})

const userVals = computed(() => {
  const c = charts.value
  const v = c?.new_users
  return v?.length ? v : [0]
})

const deviceVals = computed(() => {
  const c = charts.value
  const v = c?.new_devices
  return v?.length ? v : [0]
})

const cmdVals = computed(() => {
  const c = charts.value
  const v = c?.commands
  return v?.length ? v : [0]
})

/** 折线 Y 轴：0～ max(总设备数, 序列最大值)，避免「全是 2」时 min=max 画在底边、折线看起来像没画 */
const lineChart = computed(() => {
  const vals = lineValues.value
  const dc = Number(metrics.value.device_count)
  const mv = vals.length ? Math.max(...vals) : 0
  const yMax = Math.max(Number.isFinite(dc) ? dc : 0, mv, 1)
   return buildLineChart(vals, chartLabels.value, { yMin: 0, yMax, maxAxisLabels: 11 })
})

const userBarH = computed(() => barHeights(userVals.value))
const deviceBarH = computed(() => barHeights(deviceVals.value))
const cmdBarH = computed(() => barHeights(cmdVals.value, Math.max(...cmdVals.value, 1)))

const lineCaption = computed(() => charts.value?.captions?.line ?? '在线设备数量')
const barCaption = computed(() => charts.value?.captions?.users ?? '新增用户')
const deviceBarCaption = computed(() => charts.value?.captions?.devices ?? '新增设备')
const hourCaption = computed(() => charts.value?.captions?.commands ?? '指令下发')

/** 桶数多时柱宽与字号收紧（含本月按日十余点） */
const chartsBarsDense = computed(() => (charts.value?.labels?.length ?? 0) > 10)

/** 自定义即时提示（原生 title 有约 0.5～1s 延迟） */
const tipShow = ref(false)
const tipX = ref(0)
const tipY = ref(0)
const tipText = ref('')

function showTip(e: MouseEvent, text: string) {
  tipText.value = text
  tipX.value = e.clientX + 14
  tipY.value = e.clientY + 14
  tipShow.value = true
}

function moveTip(e: MouseEvent) {
  if (!tipShow.value) return
  tipX.value = e.clientX + 14
  tipY.value = e.clientY + 14
}

function hideTip() {
  tipShow.value = false
}

async function loadMetrics(period: PeriodId, opts?: { from: string; to: string }) {
  hideTip()
  loading.value = true
  err.value = ''
  try {
    const params: { period: string; from?: string; to?: string } = { period }
    if (opts?.from && opts?.to) {
      params.from = opts.from
      params.to = opts.to
    }
    metrics.value = await getDashboardMetrics(params)
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '加载失败'
    metrics.value = {}
  } finally {
    loading.value = false
  }
}

function pickPill(id: PeriodId) {
  activePill.value = id
  customPanelOpen.value = false
  customRangeActive.value = false
  apiPeriod.value = id
  loadMetrics(id)
}

function onCustomPill() {
  activePill.value = 'custom'
  customPanelOpen.value = true
}

function applyCustomRange() {
  let s = rangeStart.value
  let e = rangeEnd.value
  if (s && e && s > e) {
    const t = s
    s = e
    e = t
    rangeStart.value = s
    rangeEnd.value = e
  }
  if (!s || !e) {
    err.value = '请选择开始与结束时间。'
    return
  }
  err.value = ''
  customRangeActive.value = true
  apiPeriod.value = 'today'
  loadMetrics('today', { from: s, to: e })
}

function fmtInt(n: unknown) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—'
  return n.toLocaleString('zh-CN')
}

function fmtRate(n: unknown) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—'
  return n.toFixed(1)
}

const kpiTotalDev = computed(() => fmtInt(metrics.value.device_count))
const kpiOnlineDev = computed(() => fmtInt(metrics.value.online_count))
const kpiOnlineRate = computed(() => fmtRate(metrics.value.online_rate_percent))
const kpiActive = computed(() => fmtInt(metrics.value.active_device_7d))
const kpiUsers = computed(() => fmtInt(metrics.value.user_count))
const kpiNewDev = computed(() => fmtInt(metrics.value.devices_new_in_period))
const kpiCmd = computed(() => fmtInt(metrics.value.commands_in_period))

const subTotal = computed(() => '累计接入设备')
const subOnlineDev = computed(() => '当前在线（时点）')
const subOnlineRate = computed(() => '时点在线率')
const subActive = computed(() => '最近7天有活动的设备')
const subUsers = computed(() => {
  const p = apiPeriod.value
  const n = metrics.value.users_new_in_period
  const add = typeof n === 'number' ? n : 0
  if (customRangeActive.value) return `所选区间新增 ${add}`
  return `${periodLabel[p]}新增 ${add}`
})
const subNewDev = computed(() => {
  if (customRangeActive.value) return '按设备创建时间 · 所选区间'
  const p = apiPeriod.value
  return `按设备创建时间 · ${periodLabel[p]}`
})
const subCmd = computed(() => {
  if (customRangeActive.value) return '所选区间 · command.sent 累计'
  const p = apiPeriod.value
  return `${periodLabel[p]} · command.sent 累计`
})

const firmwareVersionTop10 = computed(() => {
  const t = metrics.value.firmware_version_top10
  if (!Array.isArray(t)) return [] as { version: string; device_count: number }[]
  return t.filter((row): row is { version: string; device_count: number } => {
    return row != null && typeof row === 'object' && typeof (row as { version?: unknown }).version === 'string'
  })
})

onMounted(() => {
  initDateInputs()
  customPanelOpen.value = false
  loadMetrics('today')
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="tipShow"
      class="dash-chart-tip"
      role="tooltip"
      :style="{ left: tipX + 'px', top: tipY + 'px' }"
    >
      {{ tipText }}
    </div>
  </Teleport>

  <!-- 与原型一致：左侧标题区贴主内容左缘，右侧时间 pill 贴右，同一行垂直对齐（≥1024px） -->
  <div class="mb-6 space-y-4">
    <div class="dash-overview-toolbar">
      <div class="admin-time-pills dash-overview-pills" role="group" aria-label="统计时间范围">
        <button
          v-for="p in pills"
          :key="p.id"
          type="button"
          class="admin-time-pill"
          :class="{ 'is-active': activePill === p.id }"
          :data-range="p.id"
          @click="pickPill(p.id)"
        >
          {{ p.label }}
        </button>
        <button
          type="button"
          class="admin-time-pill"
          :class="{ 'is-active': activePill === 'custom' }"
          data-range="custom"
          @click="onCustomPill"
        >
          自定义
        </button>
      </div>
    </div>
    <div
      v-show="customPanelOpen"
      class="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-3"
    >
      <div class="min-w-0 flex-1">
        <p class="text-xs font-bold text-slate-600 mb-2">自定义时间范围</p>
        <AdminDateTimeRangePicker
          v-model:start="rangeStart"
          v-model:end="rangeEnd"
          start-placeholder="开始日期时间"
          end-placeholder="结束日期时间"
        />
      </div>
      <button
        type="button"
        class="shrink-0 rounded-lg bg-primary text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-blue-500/20 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
        @click="applyCustomRange"
      >
        应用
      </button>
    </div>
  </div>

  <p v-if="err" class="text-sm text-red-600 mb-2">{{ err }}</p>
  <p v-if="loading" class="text-sm text-slate-500 mb-4">加载中…</p>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 mb-6">
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">总设备数</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ kpiTotalDev }}</p>
      <p class="mt-1.5 text-xs text-slate-500">{{ subTotal }}</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">在线设备数</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ kpiOnlineDev }}</p>
      <p class="mt-1.5 text-xs font-medium text-emerald-600">{{ subOnlineDev }}</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">设备在线率</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">
        {{ kpiOnlineRate }}<span class="text-lg font-semibold text-slate-500">%</span>
      </p>
      <p class="mt-1.5 text-xs font-medium text-slate-500">{{ subOnlineRate }}</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">活跃设备</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ kpiActive }}</p>
      <p class="mt-1.5 text-xs text-slate-500">{{ subActive }}</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">累计用户数</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ kpiUsers }}</p>
      <p class="mt-1.5 text-xs font-medium text-emerald-600">{{ subUsers }}</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">新增设备</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ kpiNewDev }}</p>
      <p class="mt-1.5 text-xs font-medium text-slate-500">{{ subNewDev }}</p>
    </article>
    <article class="admin-card admin-kpi-card p-5">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">指令数</p>
      <p class="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{{ kpiCmd }}</p>
      <p class="mt-1.5 text-xs text-slate-500">{{ subCmd }}</p>
    </article>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 lg:items-stretch">
    <section class="admin-card p-5 flex flex-col min-h-0">
      <div class="flex justify-between items-center gap-2 mb-3 shrink-0 min-h-[2.75rem]">
        <h2 class="text-sm font-bold text-slate-800">新增用户</h2>
        <span class="text-xs text-slate-400 font-medium text-right max-w-[14rem]">{{ barCaption }}</span>
      </div>
      <div class="admin-chart-area admin-chart-area--twin flex flex-col h-[260px]">
        <div
          class="admin-chart-bars flex-1 min-h-0 h-full"
          :class="{ 'admin-chart-bars--dense': chartsBarsDense }"
        >
          <div v-for="(h, i) in userBarH" :key="'u' + i" class="admin-chart-bars__col">
            <div class="admin-chart-bars__plot">
              <div
                class="admin-chart-bars__bar"
                :style="{ height: h + 'px' }"
                @mouseenter="showTip($event, `${chartLabels[i] ?? ''}：${userVals[i] ?? 0} 人`)"
                @mousemove="moveTip"
                @mouseleave="hideTip"
              />
            </div>
            <span class="admin-chart-bars__label">{{ chartLabelsDisplay[i] ?? '' }}</span>
          </div>
        </div>
      </div>
    </section>
    <section class="admin-card p-5 flex flex-col min-h-0">
      <div class="flex justify-between items-center gap-2 mb-3 shrink-0 min-h-[2.75rem]">
        <h2 class="text-sm font-bold text-slate-800">新增设备</h2>
        <span class="text-xs text-slate-400 font-medium text-right max-w-[14rem]">{{ deviceBarCaption }}</span>
      </div>
      <div class="admin-chart-area admin-chart-area--twin flex flex-col h-[260px]">
        <div
          class="admin-chart-bars flex-1 min-h-0 h-full"
          :class="{ 'admin-chart-bars--dense': chartsBarsDense }"
        >
          <div v-for="(h, i) in deviceBarH" :key="'d' + i" class="admin-chart-bars__col">
            <div class="admin-chart-bars__plot">
              <div
                class="admin-chart-bars__bar"
                :style="{ height: h + 'px' }"
                @mouseenter="showTip($event, `${chartLabels[i] ?? ''}：${deviceVals[i] ?? 0} 台`)"
                @mousemove="moveTip"
                @mouseleave="hideTip"
              />
            </div>
            <span class="admin-chart-bars__label">{{ chartLabelsDisplay[i] ?? '' }}</span>
          </div>
        </div>
      </div>
    </section>
    <section class="admin-card p-5 flex flex-col min-h-0">
      <div class="flex justify-between items-center gap-2 mb-3 shrink-0 min-h-[2.75rem]">
        <h2 class="text-sm font-bold text-slate-800">在线设备数量趋势</h2>
        <span class="text-xs text-slate-400 font-medium text-right max-w-[14rem]">{{ lineCaption }}</span>
      </div>
      <div class="admin-chart-area admin-chart-area--twin flex flex-col h-[260px]">
        <svg
          class="admin-chart-svg w-full h-full block"
          viewBox="0 0 400 152"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="在线设备数量折线图"
        >
          <defs>
            <linearGradient id="adminLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#2563eb" />
              <stop offset="100%" stop-color="#60a5fa" />
            </linearGradient>
            <linearGradient id="adminFillGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
            </linearGradient>
          </defs>
          <g>
            <line
              v-for="(gy, gi) in lineChart.gridYs"
              :key="gi"
              class="admin-chart-line-grid"
              :x1="lineChart.pad"
              :y1="gy"
              :x2="lineChart.w - lineChart.pad"
              :y2="gy"
            />
          </g>
          <path class="admin-chart-line-fill" fill="url(#adminFillGrad)" :d="lineChart.fillD" />
          <path class="admin-chart-line-path" :d="lineChart.pathD" />
          <g class="dash-line-points">
            <circle
              v-for="(v, i) in lineChart.vertices"
              :key="'dot' + i"
              :cx="v.x"
              :cy="v.y"
              r="3.5"
              fill="#2563eb"
              class="pointer-events-none opacity-90"
            />
            <circle
              v-for="(v, i) in lineChart.vertices"
              :key="'pt' + i"
              :cx="v.x"
              :cy="v.y"
              r="12"
              fill="transparent"
              stroke="none"
              class="cursor-crosshair"
              @mouseenter="showTip($event, `${v.label}：在线设备 ${v.value} 台`)"
              @mousemove="moveTip"
              @mouseleave="hideTip"
            />
          </g>
          <g class="admin-chart-line-xaxis" aria-hidden="true">
            <text
              v-for="(lb, i) in lineChart.xLabels"
              v-show="lb.text"
              :key="'xl' + i"
              :x="lb.x"
              :y="lb.y"
              text-anchor="middle"
              class="admin-chart-line-xlabel"
              :class="{
                'admin-chart-line-xlabel--dense': chartsBarsDense,
                'admin-chart-line-xlabel--tilt': lineChart.xLabelTilt
              }"
              :transform="lineChart.xLabelTilt ? `rotate(-34 ${lb.x} ${lb.y})` : ''"
            >
              {{ lb.text }}
            </text>
          </g>
        </svg>
      </div>
    </section>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 xl:items-stretch">
    <section class="admin-card p-5 flex flex-col min-h-0 h-full">
      <div class="flex justify-between items-center gap-2 mb-3 shrink-0 min-h-[2.75rem]">
        <h2 class="text-sm font-bold text-slate-800">指令下发量</h2>
        <span class="text-xs text-slate-400 font-medium text-right max-w-[14rem]">{{ hourCaption }}</span>
      </div>
      <div class="admin-chart-area admin-chart-area--twin flex flex-col flex-1 min-h-0 h-[260px]">
        <div
          class="admin-chart-bars flex-1 min-h-0 h-full"
          :class="{ 'admin-chart-bars--dense': chartsBarsDense }"
        >
          <div v-for="(h, i) in cmdBarH" :key="'c' + i" class="admin-chart-bars__col">
            <div class="admin-chart-bars__plot">
              <div
                class="admin-chart-bars__bar"
                :style="{ height: h + 'px' }"
                @mouseenter="showTip($event, `${chartLabels[i] ?? ''}：${cmdVals[i] ?? 0} 次`)"
                @mousemove="moveTip"
                @mouseleave="hideTip"
              />
            </div>
            <span class="admin-chart-bars__label">{{ chartLabelsDisplay[i] ?? '' }}</span>
          </div>
        </div>
      </div>
    </section>
    <section class="admin-card p-5 flex flex-col min-h-0 h-full">
      <div class="mb-3 shrink-0 min-h-[2.75rem] flex items-center justify-between gap-2">
        <h2 class="text-sm font-bold text-slate-800">最近 10 个固件版本 · 设备数</h2>
        <span class="text-xs text-slate-400">按固件表 id 倒序</span>
      </div>
      <div class="flex-1 min-h-0 overflow-auto text-sm">
        <table class="w-full border-collapse text-left">
          <thead>
            <tr class="border-b border-slate-200 text-xs text-slate-500">
              <th class="py-2 pr-2 font-semibold">版本号</th>
              <th class="py-2 text-right font-semibold tabular-nums">设备数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in firmwareVersionTop10" :key="idx" class="border-b border-slate-100 text-slate-700">
              <td class="py-2 pr-2 font-mono text-xs">{{ row.version }}</td>
              <td class="py-2 text-right tabular-nums font-medium">{{ row.device_count.toLocaleString('zh-CN') }}</td>
            </tr>
            <tr v-if="firmwareVersionTop10.length === 0">
              <td colspan="2" class="py-8 text-center text-slate-400">暂无固件版本记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 大屏：仅时间范围 pill，靠右对齐 */
.dash-overview-toolbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  width: 100%;
}
.dash-overview-pills {
  width: 100%;
  justify-content: flex-end;
}
@media (min-width: 1024px) {
  .dash-overview-pills {
    width: auto;
    flex: 0 0 auto;
  }
}

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
  .lg\:items-stretch {
    align-items: stretch;
  }
 .lg\:max-w-xl {
    max-width: 36rem;
  }
  .lg\:max-w-\[44rem\] {
    max-width: 44rem;
  }
  .lg\:w-auto {
    width: auto;
  }
  .lg\:shrink-0 {
    flex-shrink: 0;
  }
  .lg\:items-end {
    align-items: flex-end;
  }
}
@media (min-width: 1280px) {
  .xl\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .xl\:grid-cols-7 {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
  .xl\:items-stretch {
    align-items: stretch;
  }
}
.flex {
  display: flex;
}
.flex-col {
  flex-direction: column;
}
.gap-4 {
  gap: 1rem;
}
.gap-3 {
  gap: 0.75rem;
}
.gap-2 {
  gap: 0.5rem;
}
.gap-1 {
  gap: 0.25rem;
}
.mb-6 {
  margin-bottom: 1.5rem;
}
.mb-4 {
  margin-bottom: 1rem;
}
.mb-3 {
  margin-bottom: 0.75rem;
}
.mb-2 {
  margin-bottom: 0.5rem;
}
.space-y-3 > * + * {
  margin-top: 0.75rem;
}
.min-h-0 {
  min-height: 0;
}
.min-h-\[14rem\] {
  min-height: 14rem;
}
.min-h-\[11rem\] {
  min-height: 11rem;
}
.h-\[260px\] {
  height: 260px;
}
.h-full {
  height: 100%;
}
.shrink-0 {
  flex-shrink: 0;
}
.flex-1 {
  flex: 1 1 0%;
}
.min-w-0 {
  min-width: 0;
}
.w-full {
  width: 100%;
}
.max-w-xl {
  max-width: 36rem;
}
.max-w-\[14rem\] {
  max-width: 14rem;
}
.text-right {
  text-align: right;
}
.bg-primary {
  background-color: #2563eb;
}
.pointer-events-none {
  pointer-events: none;
}
.opacity-90 {
  opacity: 0.9;
}
.cursor-crosshair {
  cursor: crosshair;
}
</style>

<style>
/* Teleport 到 body，需非 scoped */
.dash-chart-tip {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.35;
  font-weight: 500;
  max-width: min(20rem, calc(100vw - 1rem));
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.22);
  white-space: nowrap;
  transform: translateZ(0);
}
</style>
