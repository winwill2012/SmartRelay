<script setup lang="ts">
import { ref } from 'vue'
import { adminChangePassword } from '../api/client'

const oldPassword = ref('')
const newPassword = ref('')
const loading = ref(false)
const msg = ref('')
const err = ref('')

async function onSubmit(e: Event) {
  e.preventDefault()
  msg.value = ''
  err.value = ''
  if (newPassword.value.length < 6) {
    err.value = '新密码至少 6 位'
    return
  }
  loading.value = true
  try {
    await adminChangePassword(oldPassword.value, newPassword.value)
    msg.value = '密码已更新'
    oldPassword.value = ''
    newPassword.value = ''
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '修改失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-md">
    <div class="admin-card p-7">
      <h2 class="text-lg font-bold text-slate-900 mb-4">修改密码</h2>
      <p v-if="msg" class="text-sm text-emerald-600 mb-2">{{ msg }}</p>
      <p v-if="err" class="text-sm text-red-600 mb-2">{{ err }}</p>
      <form class="space-y-4" @submit="onSubmit">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">当前密码</label>
          <input v-model="oldPassword" type="password" autocomplete="current-password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">新密码</label>
          <input v-model="newPassword" type="password" autocomplete="new-password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-lg bg-[#2563eb] text-white font-medium py-2.5 disabled:opacity-60"
        >
          {{ loading ? '提交中…' : '保存' }}
        </button>
      </form>
    </div>
  </div>
</template>
