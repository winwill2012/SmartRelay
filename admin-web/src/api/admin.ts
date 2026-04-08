import { http } from './http'

export interface AdminLoginBody {
  username: string
  password: string
}

export interface AdminLoginData {
  token: string
  admin?: { id: number; username: string }
}

export function adminLogin(body: AdminLoginBody) {
  return http.post<AdminLoginData>('/v1/admin/login', body)
}

export function adminChangePassword(body: { old_password: string; new_password: string }) {
  return http.post('/v1/admin/password', body)
}

export interface DashboardData {
  user_count: number
  device_count: number
  online_count: number
  today_command_count: number
  series?: { hour: string; commands: number }[]
}

export function getDashboard() {
  return http.get<DashboardData>('/v1/admin/dashboard')
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface AdminUserRow {
  user_id: string
  wx_openid?: string
  nickname?: string
  created_at: string
  last_login_at?: string | null
}

export function getAdminUsers(params: { page?: number; page_size?: number }) {
  return http.get<Paged<AdminUserRow>>('/v1/admin/users', { params })
}

export interface AdminUserDetail {
  user_id: string
  wx_openid?: string
  nickname?: string
  created_at?: string | null
  last_login_at?: string | null
  devices?: {
    device_id: string
    device_sn: string
    relay_state: number
    online: number
    remark_name?: string | null
  }[]
}

export function getAdminUser(userId: string) {
  return http.get<AdminUserDetail>(`/v1/admin/users/${userId}`)
}

export interface AdminDeviceRow {
  device_id: string
  device_sn: string
  online: number
  relay_state: number
  owner_user_id?: string | null
  remark_name?: string | null
  last_seen_at?: string | null
}

export function getAdminDevices(params: { page?: number; page_size?: number }) {
  return http.get<Paged<AdminDeviceRow>>('/v1/admin/devices', { params })
}

export interface OperationLogRow {
  id: number
  action: string
  source: string
  created_at: string
  cmd_id?: string
}

export function getAdminDeviceLogs(deviceId: string, params: { page?: number; page_size?: number }) {
  return http.get<Paged<OperationLogRow>>(`/v1/admin/devices/${deviceId}/logs`, {
    params
  })
}
