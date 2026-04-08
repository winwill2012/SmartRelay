import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const ADMIN_TOKEN_KEY = 'sr_admin_token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(ADMIN_TOKEN_KEY))
  const username = ref<string>('')

  const isAuthenticated = computed(() => !!token.value)

  function setSession(t: string, user?: string) {
    token.value = t
    localStorage.setItem(ADMIN_TOKEN_KEY, t)
    if (user) username.value = user
  }

  function clear() {
    token.value = null
    username.value = ''
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  }

  return { token, username, isAuthenticated, setSession, clear }
})
