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
const ROLE_KEY = 'sr_admin_role'
const USERNAME_KEY = 'sr_admin_username'

export type AdminRole = 'admin' | 'visitor'

export function getAdminToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setAdminToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(ROLE_KEY)
    localStorage.removeItem(USERNAME_KEY)
  }
}

export function getAdminRole(): AdminRole {
  const r = localStorage.getItem(ROLE_KEY)
  return r === 'visitor' ? 'visitor' : 'admin'
}

export function setAdminProfile(username: string | null, role: AdminRole | null): void {
  if (username != null) localStorage.setItem(USERNAME_KEY, username)
  else localStorage.removeItem(USERNAME_KEY)
  if (role != null) localStorage.setItem(ROLE_KEY, role)
  else localStorage.removeItem(ROLE_KEY)
}

export function getAdminUsername(): string {
  return localStorage.getItem(USERNAME_KEY) || ''
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
    // 实例默认 Content-Type 为 json；上传 FormData 时必须去掉，由运行时自动带 multipart boundary
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      config.headers.delete('Content-Type')
    }
    return config
  })
  c.interceptors.response.use(
    (r) => r,
    async (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 403) {
        const d = error.response?.data as { message?: string } | undefined
        const msg = d?.message || '无权限执行此操作'
        if (typeof window !== 'undefined') window.alert(msg)
      }
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
  const res = await http.post<
    ApiEnvelope<{
      access_token: string
      expires_in?: number
      admin?: { id: number; username: string; role: AdminRole }
    }>
  >('/admin/auth/login', { username, password })
  return unwrap(res)
}

export async function fetchAdminMe() {
  const res = await http.get<ApiEnvelope<{ id: number; username: string; role: AdminRole }>>('/admin/auth/me')
  return unwrap(res)
}

export async function listAdminAccounts() {
  const res = await http.get<ApiEnvelope<{ items: { id: number; username: string; role: string; created_at: string }[] }>>(
    '/admin/system/accounts'
  )
  return unwrap(res)
}

export async function createVisitorAccount(username: string, password: string) {
  const res = await http.post<ApiEnvelope<{ id: number; username: string; role: string }>>('/admin/system/accounts', {
    username,
    password
  })
  return unwrap(res)
}

export type AdminLoginLogRow = {
  id: number
  admin_user_id: number | null
  username: string | null
  ip: string | null
  user_agent: string | null
  success: boolean
  fail_reason: string | null
  created_at: string
}

export type AdminOperationLogRow = {
  id: number
  admin_user_id: number
  username: string | null
  method: string
  path: string
  status_code: number | null
  created_at: string
}

export async function getAdminLoginLogs(params?: { page?: number; page_size?: number }) {
  const res = await http.get<
    ApiEnvelope<{ items: AdminLoginLogRow[]; total: number; page: number; page_size: number }>
  >('/admin/system/logs/login', { params })
  return unwrap(res)
}

export async function getAdminOperationLogs(params?: { page?: number; page_size?: number }) {
  const res = await http.get<
    ApiEnvelope<{ items: AdminOperationLogRow[]; total: number; page: number; page_size: number }>
  >('/admin/system/logs/operations', { params })
  return unwrap(res)
}

export async function adminChangePassword(old_password: string, new_password: string) {
  const res = await http.post<ApiEnvelope<unknown>>('/admin/auth/password', {
    old_password,
    new_password
  })
  return unwrap(res)
}

export async function getDashboardMetrics(params?: { period?: string; from?: string; to?: string }) {
  const res = await http.get<ApiEnvelope<Record<string, unknown>>>('/admin/dashboard/metrics', {
    params
  })
  return unwrap(res)
}

export async function getAdminUsers(params?: {
  page?: number
  page_size?: number
  q?: string
  reg_start?: string
  reg_end?: string
  login_start?: string
  login_end?: string
}) {
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

export async function getAdminDevices(params?: {
  page?: number
  page_size?: number
  q?: string
  last_seen_start?: string
  last_seen_end?: string
}) {
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

export async function getAdminFirmwareList() {
  const res = await http.get<ApiEnvelope<{ items?: unknown[]; list?: unknown[] }>>('/admin/firmware')
  return unwrap(res)
}

/** 固件 multipart：禁止手写 Content-Type，须由浏览器/axios 自动带 boundary，否则上传会失败并报 Network Error */
export async function uploadFirmware(form: FormData) {
  const res = await http.post<ApiEnvelope<unknown>>('/admin/firmware', form, {
    timeout: 300000
  })
  return unwrap(res)
}

export async function patchFirmware(id: string | number, body: Record<string, unknown>) {
  const res = await http.patch<ApiEnvelope<unknown>>(`/admin/firmware/${id}`, body)
  return unwrap(res)
}

export async function deleteFirmware(id: string | number) {
  const res = await http.delete<ApiEnvelope<unknown>>(`/admin/firmware/${id}`)
  return unwrap(res)
}
