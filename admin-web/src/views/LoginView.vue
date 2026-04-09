<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isAxiosError } from 'axios'
import { adminLogin, apiBase, setAdminToken } from '../api/client'

const router = useRouter()
const route = useRoute()
const username = ref('admin')
const password = ref('')
const showPwd = ref(false)
const loading = ref(false)
const err = ref('')

function formatLoginError(e: unknown): string {
  if (isAxiosError(e)) {
    if (e.code === 'ERR_NETWORK' || e.message === 'Network Error') {
      return `无法连接后端（当前 API：${apiBase}）。请确认已启动 SmartRelay 后端（uvicorn）且端口与代理一致。`
    }
    if (e.response?.data && typeof e.response.data === 'object') {
      const d = e.response.data as { message?: string; detail?: unknown }
      if (d.message) return String(d.message)
    }
  }
  return e instanceof Error ? e.message : '登录失败'
}

async function onSubmit(e: Event) {
  e.preventDefault()
  err.value = ''
  loading.value = true
  try {
    const data = await adminLogin(username.value, password.value)
    const token = (data as { access_token?: string }).access_token
    if (!token) throw new Error('未返回 access_token')
    setAdminToken(token)
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } catch (e: unknown) {
    err.value = formatLoginError(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center px-4 py-12 admin-body">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <p class="text-xs font-medium uppercase tracking-wider text-slate-500">SmartRelay · 管理后台</p>
        <h1 class="text-2xl font-bold text-slate-900 mt-2">管理员登录</h1>
      </div>

      <form class="admin-card p-7 space-y-5 shadow-xl" @submit="onSubmit">
        <p v-if="err" class="text-sm text-red-600">{{ err }}</p>
        <div>
          <label for="username" class="block text-sm font-medium text-slate-700 mb-1.5">账号</label>
          <input
            id="username"
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="请输入账号"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label for="password" class="block text-sm font-medium text-slate-700 mb-1.5">密码</label>
          <div class="relative">
            <input
              id="password"
              v-model="password"
              :type="showPwd ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="请输入密码"
              class="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-11 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <button
              type="button"
              class="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              @click="showPwd = !showPwd"
            >
              {{ showPwd ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>
        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-lg bg-primary text-white font-medium py-2.5 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-primary/40 transition disabled:opacity-60"
        >
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>
      <p class="text-center text-xs text-slate-500 mt-6">对接：配置环境变量 VITE_API_BASE（含 /api/v1）</p>
    </div>
  </div>
</template>

<style scoped>
.bg-primary {
  background-color: #2563eb;
}
.text-primary {
  color: #2563eb;
}
.focus\:ring-primary\/30:focus {
  --tw-ring-color: rgb(37 99 235 / 0.3);
}
.focus\:border-primary:focus {
  border-color: #2563eb;
}
.focus\:ring-primary\/40:focus {
  --tw-ring-color: rgb(37 99 235 / 0.4);
}
.hover\:bg-blue-600:hover {
  background-color: #2563eb;
}
</style>
