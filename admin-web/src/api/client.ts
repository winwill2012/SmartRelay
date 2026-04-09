import axios, { type AxiosInstance, isAxiosError } from 'axios'

function resolveApiBase(): string {
  const env = (import.meta.env.VITE_API_BASE as string | undefined)?.trim()
  if (env) return env.replace(/\/$/, '')
  // 开发环境默认走 Vite 代理（见 vite.config.ts），与浏览器同源，无 CORS
  if (import.meta.env.DEV) return '/api/v1'
  return 'http://127.0.0.1:8000/api/v1'
}

export const apiBase = resolveApiBase()

const TOKEN_KEY = 'sr_admin_token'

export function getAdminToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setAdminToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

function unwrap<T>(p: { data: ApiEnvelope<T> }): T {
  const b = p.data
  if (b.code !== 0) {
    const err = new Error(b.message || `错误 ${b.code}`)
    ;(err as Error & { code?: number }).code = b.code
    throw err
  }
  return b.data
}

export function createClient(): AxiosInstance {
  const c = axios.create({
    baseURL: apiBase,
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' }
  })
  c.interceptors.request.use((config) => {
    const t = getAdminToken()
    if (t) {
      // Axios 1.x 使用 AxiosHeaders，用 set 确保 Authorization 一定带上
      config.headers.set('Authorization', `Bearer ${t}`)
    }
    return config
  })
  c.interceptors.response.use(
    (r) => r,
    async (error: unknown) => {
      if (!isAxiosError(error) || error.response?.status !== 401) {
        return Promise.reject(error)
      }
      // token 失效、更换 JWT_SECRET、或未登录访问受保护接口
      setAdminToken(null)
      try {
        const { router } = await import('../router')
        if (router.currentRoute.value.name !== 'login') {
          await router.push({
            name: 'login',
            query: { redirect: router.currentRoute.value.fullPath }
          })
        }
      } catch {
        window.location.assign(`${import.meta.env.BASE_URL || '/'}login`)
      }
      return Promise.reject(error)
    }
  )
  return c
}

export const http = createClient()

export async function adminLogin(username: string, password: string) {
  const res = await http.post<ApiEnvelope<{ access_token: string; expires_in?: number }>>(
    '/admin/auth/login',
    { username, password }
  )
  return unwrap(res)
}

export async function adminChangePassword(old_password: string, new_password: string) {
  const res = await http.post<ApiEnvelope<unknown>>('/admin/auth/password', {
    old_password,
    new_password
  })
  return unwrap(res)
}

export async function getDashboardMetrics(params?: Record<string, string>) {
  const res = await http.get<ApiEnvelope<Record<string, unknown>>>('/admin/dashboard/metrics', {
    params
  })
  return unwrap(res)
}

export async function getAdminUsers(params?: { page?: number; page_size?: number; q?: string }) {
  const res = await http.get<ApiEnvelope<{ list?: unknown[]; items?: unknown[]; total?: number }>>(
    '/admin/users',
    { params }
  )
  return unwrap(res)
}

export async function getAdminUser(id: string | number) {
  const res = await http.get<ApiEnvelope<unknown>>(`/admin/users/${id}`)
  return unwrap(res)
}

export async function getAdminDevices(params?: { page?: number; page_size?: number; q?: string }) {
  const res = await http.get<ApiEnvelope<{ list?: unknown[]; items?: unknown[]; total?: number }>>(
    '/admin/devices',
    { params }
  )
  return unwrap(res)
}

export async function getAdminDevice(id: string | number) {
  const res = await http.get<ApiEnvelope<unknown>>(`/admin/devices/${id}`)
  return unwrap(res)
}

export async function getAdminDeviceLogs(
  id: string | number,
  params?: { page?: number; page_size?: number }
) {
  const res = await http.get<ApiEnvelope<unknown>>(`/admin/devices/${id}/logs`, { params })
  return unwrap(res)
}

export async function uploadFirmware(form: FormData) {
  const res = await http.post<ApiEnvelope<unknown>>('/admin/firmware', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return unwrap(res)
}

export async function patchFirmware(id: string | number, body: Record<string, unknown>) {
  const res = await http.patch<ApiEnvelope<unknown>>(`/admin/firmware/${id}`, body)
  return unwrap(res)
}
