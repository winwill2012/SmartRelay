<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { createVisitorAccount, listAdminAccounts } from '../api/client'
import { formatAdminDateTime } from '../lib/formatDisplay'

type Row = { id: number; username: string; role: string; created_at: string }

const loading = ref(true)
const err = ref('')
const items = ref<Row[]>([])
const createErr = ref('')
const newUsername = ref('')
const newPassword = ref('')
const creating = ref(false)

async function load() {
  loading.value = true
  err.value = ''
  try {
    const data = await listAdminAccounts()
    items.value = data.items || []
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function onCreate(e: Event) {
  e.preventDefault()
  createErr.value = ''
  const u = newUsername.value.trim()
  const p = newPassword.value
  if (!u || !p) {
    createErr.value = '请填写账号与密码'
    return
  }
  if (p.length < 8) {
    createErr.value = '密码至少 8 位'
    return
  }
  creating.value = true
  try {
    await createVisitorAccount(u, p)
    newUsername.value = ''
    newPassword.value = ''
    await load()
  } catch (e: unknown) {
    createErr.value = e instanceof Error ? e.message : '创建失败'
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <p v-if="err" class="text-sm text-red-600 mb-3">{{ err }}</p>

  <section class="admin-card p-5 mb-6">
    <h2 class="text-sm font-bold text-slate-800 mb-3">新建访客账号</h2>
    <p class="text-xs text-slate-500 mb-4">访客登录后仅可查看各页数据，不能上传/修改固件或变更业务数据。</p>
    <form class="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end" @submit="onCreate">
      <div class="min-w-[12rem]">
        <label class="block text-xs font-semibold text-slate-600 mb-1">登录名</label>
        <input
          v-model="newUsername"
          type="text"
          autocomplete="off"
          class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="字母数字等"
        />
      </div>
      <div class="min-w-[12rem]">
        <label class="block text-xs font-semibold text-slate-600 mb-1">初始密码</label>
        <input
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="不少于 8 位"
        />
      </div>
      <button
        type="submit"
        class="rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-60"
        :disabled="creating"
      >
        {{ creating ? '创建中…' : '创建访客' }}
      </button>
    </form>
    <p v-if="createErr" class="text-sm text-red-600 mt-2">{{ createErr }}</p>
  </section>

  <section class="admin-card p-0 overflow-hidden">
    <h2 class="text-sm font-bold text-slate-800 px-5 pt-5 mb-2">后台账号列表</h2>
    <p v-if="loading" class="text-sm text-slate-500 px-5 pb-5">加载中…</p>
    <div v-else class="admin-table-wrap">
      <table class="min-w-[480px] w-full text-left text-sm">
        <thead class="bg-slate-50 text-slate-600 border-y border-slate-200">
          <tr>
            <th class="px-5 py-3 font-semibold">用户名</th>
            <th class="px-5 py-3 font-semibold">角色</th>
            <th class="px-5 py-3 font-semibold">创建时间</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="row in items" :key="row.id" class="hover:bg-slate-50/80">
            <td class="px-5 py-3 font-medium text-slate-900">{{ row.username }}</td>
            <td class="px-5 py-3">
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="
                  row.role === 'admin' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-700'
                "
              >
                {{ row.role === 'admin' ? '管理员' : '访客' }}
              </span>
            </td>
            <td class="px-5 py-3 text-slate-600 tabular-nums">{{ formatAdminDateTime(row.created_at) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!items.length" class="text-sm text-slate-500 py-8 text-center">暂无记录</p>
    </div>
  </section>
</template>
