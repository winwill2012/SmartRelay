<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { isAxiosError } from 'axios'
import { getAdminFirmwareList, uploadFirmware, patchFirmware, deleteFirmware, getAdminRole } from '../api/client'
import { formatAdminDateTime } from '../lib/formatDisplay'
import {
  parseVersionParts,
  validateNewVersionOrder,
  releaseNotesToLines
} from '../lib/firmwareVersion'

type FwRow = {
  id: number
  version: string
  file_url?: string
  file_md5?: string
  release_notes?: string | null
  is_active: boolean
  created_at: string
  device_count?: number
}

function formatUploadError(e: unknown): string {
  if (isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; detail?: unknown }
    if (typeof d.message === 'string' && d.message.trim()) return d.message
    const det = d.detail
    if (Array.isArray(det)) {
      const parts = det
        .map((item: { msg?: string; loc?: unknown }) => {
          const loc = Array.isArray(item.loc) ? item.loc.filter(Boolean).join('.') : ''
          const m = item.msg ?? ''
          return loc ? `${loc}：${m}` : m
        })
        .filter(Boolean)
      if (parts.length) return parts.join('；')
    }
    if (typeof det === 'string' && det) return det
  }
  return e instanceof Error ? e.message : '上传失败'
}

const loading = ref(false)
const listLoading = ref(true)
const err = ref('')
const list = ref<FwRow[]>([])

const versionInput = ref('')
const fileRef = ref<HTMLInputElement | null>(null)
const fileName = ref('')

const releaseDlgRef = ref<HTMLDialogElement | null>(null)
const changelog = ref('')

const dlgFileSummary = ref('')
const dlgVerSummary = ref('')

const popOpen = ref(false)
const popTitle = ref('')
const popLines = ref<string[]>([])
const popLeft = ref(0)
const popTop = ref(0)
const popVerKey = ref<string | null>(null)
const popoverRef = ref<HTMLElement | null>(null)

const isVisitor = computed(() => getAdminRole() === 'visitor')

function onFileChange() {
  const f = fileRef.value?.files?.[0]
  fileName.value = f ? f.name : '未选择文件'
}

function listVersions(): string[] {
  return list.value.map((r) => r.version)
}

function openPublishDialog() {
  err.value = ''
  const input = fileRef.value
  const f = input?.files?.[0]
  const ver = versionInput.value.trim()
  if (!f) {
    window.alert('请先选择固件文件（.bin）。')
    return
  }
  if (!ver) {
    window.alert('请填写版本号。')
    return
  }
  if (!parseVersionParts(ver)) {
    window.alert('版本号格式无效，请使用数字与点分隔，例如 1.4.3。')
    return
  }
  if (list.value.some((r) => r.version === ver)) {
    window.alert('列表中已存在该版本号，请修改版本号后重试。')
    return
  }
  const order = validateNewVersionOrder(ver, listVersions())
  if (!order.ok) {
    window.alert(order.message)
    return
  }
  dlgFileSummary.value = f.name
  dlgVerSummary.value = ver
  changelog.value = ''
  releaseDlgRef.value?.showModal()
  void nextTick(() => {
    document.getElementById('fw-release-changelog')?.focus()
  })
}

function closeReleaseDialog() {
  releaseDlgRef.value?.close()
}

function onReleaseBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) releaseDlgRef.value?.close()
}

async function submitRelease(e: Event) {
  e.preventDefault()
  err.value = ''
  const log = changelog.value.trim()
  if (!log) {
    window.alert('请填写固件更新日志。')
    return
  }
  const input = fileRef.value
  const f = input?.files?.[0]
  const ver = versionInput.value.trim()
  if (!f || !ver) {
    window.alert('未找到固件文件或版本号，请重新选择后再保存。')
    releaseDlgRef.value?.close()
    return
  }
  if (!parseVersionParts(ver) || list.value.some((r) => r.version === ver)) {
    window.alert('版本号无效或已存在。')
    return
  }
  const order = validateNewVersionOrder(ver, listVersions())
  if (!order.ok) {
    window.alert(order.message)
    return
  }

  loading.value = true
  try {
    const fd = new FormData()
    fd.append('file', f)
    fd.append('version', ver)
    fd.append('release_notes', log)
    await uploadFirmware(fd)
    releaseDlgRef.value?.close()
    versionInput.value = ''
    if (input) input.value = ''
    fileName.value = '未选择文件'
    window.alert(
      `已将「${f.name}」v${ver} 上传成功。\n\n该版本默认未启用，请在列表中开启「是否启用」后，设备端才可拉取更新。`
    )
    await loadList()
  } catch (e: unknown) {
    err.value = formatUploadError(e)
    window.alert(err.value)
  } finally {
    loading.value = false
  }
}

async function removeFirmware(row: FwRow) {
  if (isVisitor.value) return
  const n = row.device_count ?? 0
  let msg = `确定删除固件版本 v${row.version}？将同时删除服务器上的文件包，不可恢复。`
  if (n > 0) {
    msg += `\n\n当前有 ${n} 台设备在库中登记为该版本（仅删除服务端记录与文件，设备本地固件版本不变）。`
  }
  if (!window.confirm(msg)) return
  err.value = ''
  try {
    await deleteFirmware(row.id)
    await loadList()
  } catch (e: unknown) {
    err.value = formatUploadError(e)
    window.alert(err.value)
  }
}

async function loadList() {
  listLoading.value = true
  err.value = ''
  try {
    const data = await getAdminFirmwareList()
    const rows = (data as { items?: FwRow[]; list?: FwRow[] }).items ||
      (data as { items?: FwRow[]; list?: FwRow[] }).list ||
      []
    list.value = rows as FwRow[]
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '加载失败'
    list.value = []
  } finally {
    listLoading.value = false
  }
}

function layoutPopover(anchor: HTMLElement) {
  requestAnimationFrame(() => {
    const r = anchor.getBoundingClientRect()
    const w = popoverRef.value?.offsetWidth ?? 352
    const h = popoverRef.value?.offsetHeight ?? 280
    let left = r.left
    let top = r.bottom + 8
    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12
    if (left < 12) left = 12
    if (top + h > window.innerHeight - 12) top = r.top - h - 8
    if (top < 12) top = 12
    popLeft.value = left
    popTop.value = top
  })
}

function toggleNotes(row: FwRow, ev: MouseEvent) {
  ev.stopPropagation()
  const btn = ev.currentTarget as HTMLElement
  const v = row.version
  if (popOpen.value && popVerKey.value === v) {
    hideNotes()
    return
  }
  popVerKey.value = v
  popTitle.value = `v${v} 更新说明`
  popLines.value = releaseNotesToLines(row.release_notes)
  popOpen.value = true
  void nextTick(() => {
    layoutPopover(btn)
    requestAnimationFrame(() => layoutPopover(btn))
  })
}

function hideNotes() {
  popOpen.value = false
  popVerKey.value = null
}

async function onToggleActive(row: FwRow, ev: Event) {
  if (isVisitor.value) return
  const cb = ev.target as HTMLInputElement
  const newVal = cb.checked
  const oldVal = !!row.is_active
  cb.checked = oldVal
  const msg = newVal
    ? `确定启用 v${row.version}？启用后，设备端可拉取并更新到该版本。`
    : `确定关闭 v${row.version}？关闭后，设备端将无法拉取该版本。`
  if (!window.confirm(msg)) return
  err.value = ''
  try {
    await patchFirmware(String(row.id), { is_active: newVal })
    await loadList()
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '更新失败'
    window.alert(err.value)
  }
}

function onDocClick(e: MouseEvent) {
  const t = e.target as Node
   if (!popOpen.value) return
  if (popoverRef.value?.contains(t)) return
  if ((e.target as HTMLElement).closest?.('.fw-version-link')) return
  hideNotes()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (releaseDlgRef.value?.open) return
  hideNotes()
}

function onResize() {
  if (!popOpen.value || !popVerKey.value) return
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(popVerKey.value) : popVerKey.value.replace(/"/g, '')
  const btn = document.querySelector(`.fw-version-link[data-fw-version="${esc}"]`) as HTMLElement | null
  if (btn) layoutPopover(btn)
}

onMounted(() => {
  loadList()
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize, { passive: true })
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <p v-if="err && !loading" class="text-sm text-red-600 mb-3">{{ err }}</p>

  <p
    v-if="isVisitor"
    class="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 mb-4"
  >
    当前为访客账号，仅可查看固件列表，不能上传、启用/停用或删除固件。
  </p>

  <section
    v-if="!isVisitor"
    class="admin-card border-2 border-dashed border-slate-200/90 p-6 mb-6 bg-gradient-to-br from-white to-slate-50/80"
  >
    <h2 class="text-sm font-bold text-slate-900 mb-4">上传新固件</h2>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
      <div class="lg:col-span-5">
        <label class="block text-xs font-bold text-slate-600 mb-1.5">固件文件</label>
        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <label
            class="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 cursor-pointer hover:bg-slate-50 shadow-sm shrink-0"
          >
            <input              ref="fileRef"
              type="file"
              accept=".bin"
              class="sr-only"
              @change="onFileChange"
            />
            选择文件
          </label>
          <span
            class="text-sm truncate min-w-0"
            :class="fileName !== '未选择文件' ? 'text-slate-900 font-medium' : 'text-slate-500'"
          >
            {{ fileName }}
          </span>
        </div>
      </div>
      <div class="lg:col-span-3">
        <label for="fw-version-input" class="block text-xs font-bold text-slate-600 mb-1.5">版本号</label>
        <input
          id="fw-version-input"
          v-model="versionInput"
          type="text"
          class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
          placeholder="例如 1.4.3"
          autocomplete="off"
          inputmode="decimal"
        />
      </div>
      <div class="lg:col-span-4 flex flex-wrap gap-2 justify-start lg:justify-end">
        <button
          type="button"
          class="rounded-lg bg-primary text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-60"
          :disabled="loading"
          @click="openPublishDialog"
        >
          发布固件
        </button>
      </div>
    </div>
  </section>

  <section>
    <h2 class="text-sm font-bold text-slate-800 mb-3">固件列表</h2>
    <p v-if="listLoading" class="text-sm text-slate-500 mb-2">加载中…</p>
    <div class="admin-table-wrap">
      <table class="min-w-[820px] w-full text-left text-sm">
        <caption class="sr-only">各固件版本、上传时间、是否启用、设备数量及删除操作</caption>
        <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
          <tr>
            <th class="px-4 py-3 font-semibold">版本</th>
            <th class="px-4 py-3 font-semibold">上传时间</th>
            <th class="px-4 py-3 font-semibold">访问链接</th>
            <th class="px-4 py-3 font-semibold">
              <span class="block">是否启用</span>
              <span v-if="!isVisitor" class="block font-normal text-slate-400 text-[11px] mt-0.5"
                >关闭时设备无法拉取该版本</span
              >
            </th>
            <th class="px-4 py-3 font-semibold text-right">设备数量</th>
            <th v-if="!isVisitor" class="px-4 py-3 font-semibold text-right w-24">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="row in list" :key="row.id" class="hover:bg-slate-50/80">
            <td class="px-4 py-3">
              <button
                type="button"
                class="fw-version-link"
                :data-fw-version="row.version"
                @click="toggleNotes(row, $event)"
              >
                {{ row.version }}
              </button>
            </td>
            <td class="px-4 py-3 text-slate-700 tabular-nums">{{ formatAdminDateTime(row.created_at) }}</td>
            <td class="px-4 py-3">
              <a
                v-if="row.file_url"
                :href="row.file_url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                查看地址
              </a>
              <span v-else class="text-xs text-slate-400">暂无</span>
            </td>
            <td class="px-4 py-3">
              <label
                v-if="!isVisitor"
                class="inline-flex cursor-pointer items-center gap-2"
                title="启用后，设备端可接收并更新到该版本"
              >
                <input
                  type="checkbox"
                  class="peer sr-only"
                  :checked="row.is_active"
                  :aria-label="`${row.version} 是否对设备开放更新`"
                  @change="onToggleActive(row, $event)"
                />
                <span
                  class="flex h-6 w-11 items-center rounded-full bg-slate-200 p-0.5 transition-colors peer-checked:bg-emerald-500 peer-checked:justify-end"
                >
                  <span class="block h-5 w-5 rounded-full bg-white shadow-sm shrink-0"></span>
                </span>
                <span class="text-xs text-slate-500 peer-checked:hidden">未启用</span>
                <span class="hidden text-xs font-medium text-emerald-700 peer-checked:inline">已启用</span>
              </label>
              <span v-else class="text-xs font-medium" :class="row.is_active ? 'text-emerald-700' : 'text-slate-500'">
                {{ row.is_active ? '已启用' : '未启用' }}
              </span>
            </td>
            <td
              class="px-4 py-3 text-right tabular-nums font-semibold"
              :class="(row.device_count ?? 0) > 0 ? 'text-slate-900' : 'text-slate-600'"
            >
              {{ row.device_count ?? 0 }}
            </td>
            <td v-if="!isVisitor" class="px-4 py-3 text-right">
              <button
                type="button"
                class="text-sm font-semibold text-red-600 hover:text-red-700 hover:underline"
                @click="removeFirmware(row)"
              >
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!listLoading && !list.length" class="text-sm text-slate-500 py-6 text-center">暂无固件记录</p>
    </div>
  </section>

  <Teleport to="body">
    <dialog
      ref="releaseDlgRef"
      class="admin-dialog rounded-xl border border-slate-200 p-0 shadow-2xl max-w-lg w-[min(100%,28rem)]"
      aria-labelledby="fw-release-title"
      @click="onReleaseBackdrop"
    >
      <form class="p-6" @submit="submitRelease">
        <h2 id="fw-release-title" class="text-base font-bold text-slate-900 mb-1">发布固件</h2>
        <p class="text-xs text-slate-500 mb-4">确认下列信息后填写更新日志，保存后将提交上传。</p>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-3 space-y-2 text-sm mb-4">
          <div class="flex gap-2 min-w-0">
            <span class="text-slate-500 shrink-0 w-14">文件</span>
            <span class="text-slate-900 font-medium truncate">{{ dlgFileSummary }}</span>
          </div>
          <div class="flex gap-2">
            <span class="text-slate-500 shrink-0 w-14">版本</span>
            <span class="text-slate-900 font-mono font-semibold">{{ dlgVerSummary }}</span>
          </div>
        </div>
        <label for="fw-release-changelog" class="block text-xs font-bold text-slate-600 mb-1.5">固件更新日志</label>
        <textarea
          id="fw-release-changelog"
          v-model="changelog"
          name="changelog"
          rows="6"
          required
          class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          placeholder="填写本版本变更说明、修复与兼容性注意项等…"
        />
        <div class="flex justify-end gap-2 mt-5">
          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="closeReleaseDialog"
          >
            取消
          </button>
          <button
            type="submit"
            class="rounded-lg bg-primary text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-60"
            :disabled="loading"
          >
            {{ loading ? '上传中…' : '保存' }}
          </button>
        </div>
      </form>
    </dialog>

    <div
      v-if="popOpen"
      ref="popoverRef"
      class="admin-firmware-popover is-visible"
      role="dialog"
      aria-modal="false"
      :aria-labelledby="'fw-notes-title'"
      :style="{ left: popLeft + 'px', top: popTop + 'px' }"
    >
      <div class="flex justify-between items-start gap-3 mb-2">
        <h3 id="fw-notes-title" class="text-sm font-bold text-slate-900 pr-2">{{ popTitle }}</h3>
        <button
          type="button"
          class="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="关闭"
          @click="hideNotes"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <ul class="text-sm text-slate-600 space-y-1.5 list-disc pl-4">
        <li v-for="(line, i) in popLines" :key="i">{{ line }}</li>
      </ul>
    </div>
  </Teleport>
</template>
