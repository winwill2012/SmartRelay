import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /** 不设或留空：代理到本机 http://127.0.0.1:8000。设为线上根路径（无尾斜杠亦可）时：无本地后端也可 npm run dev */
  const devProxyBase = env.VITE_DEV_API_PROXY?.trim()

  let proxy: Record<string, import('vite').ProxyOptions>
  if (devProxyBase) {
    try {
      const u = new URL(devProxyBase)
      const origin = u.origin
      const prefix = u.pathname.replace(/\/$/, '') || ''
      proxy = {
        '/api': {
          target: origin,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => prefix + path
        }
      }
    } catch {
      proxy = {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true
        }
      }
    }
  } else {
    proxy = {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }

  return {
    base: '/smart-relay/admin/',
    plugins: [vue(), tailwindcss()],
    server: {
      proxy
    }
  }
})
