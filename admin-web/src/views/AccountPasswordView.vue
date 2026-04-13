<script setup lang="ts">
import { reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { adminChangePassword, setAdminToken } from '../api/client'

const router = useRouter()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const show = reactive({ old: false, new: false, confirm: false })

const loading = ref(false)
const err = ref('')

function toggle(which: keyof typeof show) {
  show[which] = !show[which]
}

async function onSubmit(e: Event) {
  e.preventDefault()
  err.value = ''
  const oldV = oldPassword.value.trim()
  const newV = newPassword.value.trim()
  const confirmV = confirmPassword.value.trim()
  if (!oldV || !newV || !confirmV) {
    window.alert('请填写当前密码、新密码与确认密码。')
    return
  }
  if (newV !== confirmV) {
    window.alert('两次输入的新密码不一致，请重新确认。')
    return
  }
  if (newV.length < 8) {
    window.alert('新密码长度至少为 8 位。')
    return
  }
  loading.value = true
  try {
    await adminChangePassword(oldV, newV)
    setAdminToken(null)
    await router.replace({ path: '/login', query: { reauth: '1' } })
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : '修改失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-xl">
    <p class="text-sm text-slate-600 mb-6">修改成功后，请使用新密码重新登录。</p>

    <form class="admin-card p-7 space-y-5 shadow-lg" novalidate @submit="onSubmit">
      <p v-if="err" class="text-sm text-red-600">{{ err }}</p>

      <div>
        <label for="old-pw" class="block text-sm font-medium text-slate-700 mb-1.5">当前密码</label>
        <div class="relative">
          <input
            id="old-pw"
            v-model="oldPassword"
            :type="show.old ? 'text' : 'password'"
            name="oldPassword"
            autocomplete="current-password"
            class="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-11 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <button
            type="button"
            class="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            :aria-label="show.old ? '隐藏密码' : '显示密码'"
            :aria-pressed="show.old ? 'true' : 'false'"
            @click="toggle('old')"
          >
            <span v-show="!show.old" class="block" aria-hidden="true">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </span>
            <span v-show="show.old" class="block" aria-hidden="true">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>

      <div>
        <label for="new-pw" class="block text-sm font-medium text-slate-700 mb-1.5">新密码</label>
        <div class="relative">
          <input
            id="new-pw"
            v-model="newPassword"
            :type="show.new ? 'text' : 'password'"
            name="newPassword"
            autocomplete="new-password"
            class="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-11 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <button
            type="button"
            class="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            :aria-label="show.new ? '隐藏密码' : '显示密码'"
            :aria-pressed="show.new ? 'true' : 'false'"
            @click="toggle('new')"
          >
            <span v-show="!show.new" class="block" aria-hidden="true">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </span>
            <span v-show="show.new" class="block" aria-hidden="true">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            </span>
          </button>
        </div>
        <p class="mt-1 text-xs text-slate-500">建议 8 位以上，包含字母与数字。</p>
      </div>

      <div>
        <label for="confirm-pw" class="block text-sm font-medium text-slate-700 mb-1.5">确认新密码</label>
        <div class="relative">
          <input
            id="confirm-pw"
            v-model="confirmPassword"
            :type="show.confirm ? 'text' : 'password'"
            name="confirmPassword"
            autocomplete="new-password"
            class="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-11 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <button
            type="button"
            class="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            :aria-label="show.confirm ? '隐藏密码' : '显示密码'"
            :aria-pressed="show.confirm ? 'true' : 'false'"
            @click="toggle('confirm')"
          >
            <span v-show="!show.confirm" class="block" aria-hidden="true">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </span>
            <span v-show="show.confirm" class="block" aria-hidden="true">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="submit"
          :disabled="loading"
          class="rounded-lg bg-primary text-white font-medium px-5 py-2.5 text-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        >
          {{ loading ? '保存中…' : '保存新密码' }}
        </button>
        <RouterLink
          to="/dashboard"
          class="inline-flex justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          取消
        </RouterLink>
      </div>
    </form>
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
.focus-visible\:ring-primary\/35:focus-visible {
  --tw-ring-color: rgb(37 99 235 / 0.35);
}
.hover\:bg-blue-600:hover {
  background-color: #2563eb;
}
</style>
