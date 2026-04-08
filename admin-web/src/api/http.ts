import axios, { type AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { ADMIN_TOKEN_KEY } from '@/stores/auth'
import router from '@/router'

export interface ApiEnvelope<T = unknown> {
  code: number
  message: string
  data: T
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
  timeout: 30000
})

http.interceptors.request.use((config) => {
  const t = localStorage.getItem(ADMIN_TOKEN_KEY)
  if (t) {
    config.headers.Authorization = `Bearer ${t}`
  }
  return config
})

http.interceptors.response.use(
  (res) => {
    const body = res.data as ApiEnvelope
    if (body && typeof body.code === 'number') {
      if (body.code === 0) return body.data
      ElMessage.error(body.message || '请求失败')
      return Promise.reject(new ApiBizError(body.code, body.message))
    }
    return res.data
  },
  (err: AxiosError<ApiEnvelope>) => {
    const status = err.response?.status
    const body = err.response?.data as ApiEnvelope | undefined
    if (body && typeof body.code === 'number') {
      ElMessage.error(body.message || '请求失败')
      if (body.code === 40101) {
        localStorage.removeItem(ADMIN_TOKEN_KEY)
        router.push({ name: 'login' })
      }
      return Promise.reject(new ApiBizError(body.code, body.message))
    }
    if (status === 401 || status === 403) {
      localStorage.removeItem(ADMIN_TOKEN_KEY)
      router.push({ name: 'login' })
    }
    ElMessage.error(err.message || '网络错误')
    return Promise.reject(err)
  }
)

export class ApiBizError extends Error {
  constructor(
    public code: number,
    message?: string
  ) {
    super(message || `code ${code}`)
    this.name = 'ApiBizError'
  }
}

export { http }
