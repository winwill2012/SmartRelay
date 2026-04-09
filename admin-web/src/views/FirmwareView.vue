<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { http, patchFirmware } from '../api/client'

const loading = ref(false)
const err = ref('')
const list = ref<Record<string, unknown>[]>([])
const version = ref('')
const releaseNotes = ref('')
const fileRef = ref<HTMLInputElement | null>(null)

async function loadList() {
  err.value = ''
  try {
    const res = await http.get('/admin/firmware')
    const data = res.data as { code: number; data?: { list?: unknown[]; items?: unknown[] } }
    if (data.code !== 0) throw new Error((res.data as { message?: string }).message || '加载失败')
    const rows = data.data?.list || data.data?.items || []
    list.value = rows as Record<string, unknown>[]
  } catch (e: unknown) {
    /* 列表接口若未实现则静默 */
    list.value = []
  }
}

async function onUpload() {
  const input = fileRef.value
  if (!input?.files?.length) {
    err.value = '请选择固件文件'
    return
  }
  if (!version.value) {
    err.value = '请填写版本号'
    return
  }
  loading.value = true
  err.value = ''
  try {
    const fd = new FormData()
    fd.append('file', input.files[0])
    fd.append('version', version.value)
    fd.append('release_notes', releaseNotes.value)
    fd.append('is_active', '1')
    const res = await http.post('/admin/firmware', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    const body = res.data as { code: number; message?: string }
    if (body.code !== 0) throw new Error(body.message || '上传失败')
    version.value = ''
    releaseNotes.value = ''
    input.value = ''
    await loadList()
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    loading.value = false
  }
}

async function toggleActive(row: Record<string, unknown>) {
  const id = row.id
  const next = !row.is_active
  try {
    await patchFirmware(String(id), { is_active: next })
    await loadList()
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '更新失败'
  }
}

onMounted(() => {
  loadList()
})
</script>

<template>
  <div class="admin-card p-6 mb-6">
    <h2 class="text-lg font-bold text-slate-900 mb-2">上传固件</h2>
    <p class="text-xs text-slate-500 mb-4">POST /admin/firmware multipart，字段：file、version、release_notes、is_active</p>
    <p v-if="err" class="text-sm text-red-600 mb-2">{{ err }}</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">版本号</label>
        <input v-model="version" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="如 1.0.1" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">文件</label>
        <input ref="fileRef" type="file" class="block w-full text-sm" />
      </div>
      <div class="md:col-span-2">
        <label class="block text-xs font-semibold text-slate-600 mb-1">更新说明</label>
        <textarea v-model="releaseNotes" rows="3" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
    </div>
    <button
      type="button"
      :disabled="loading"
      class="mt-4 rounded-lg bg-[#2563eb] text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
      @click="onUpload"
    >
      {{ loading ? '上传中…' : '上传' }}
    </button>
  </div>

  <div class="admin-table-wrap">
    <div class="admin-table-hint">固件列表（若服务端提供 GET /admin/firmware）</div>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-slate-600">
          <th class="px-4 py-3">版本</th>
          <th class="px-4 py-3">MD5</th>
          <th class="px-4 py-3">启用</th>
          <th class="px-4 py-3">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in list" :key="String(row.id ?? row.version)" class="border-t border-slate-100">
          <td class="px-4 py-3 font-mono">{{ row.version }}</td>
          <td class="px-4 py-3 font-mono text-xs truncate max-w-xs">{{ row.file_md5 }}</td>
          <td class="px-4 py-3">{{ row.is_active ? '是' : '否' }}</td>
          <td class="px-4 py-3">
            <button type="button" class="text-[#2563eb] font-medium" @click="toggleActive(row)">
              {{ row.is_active ? '禁用' : '启用' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
