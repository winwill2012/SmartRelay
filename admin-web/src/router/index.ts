import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: '数据大屏' }
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: { title: '用户管理' }
        },
        {
          path: 'users/:id',
          name: 'user-detail',
          component: () => import('@/views/UserDetailView.vue'),
          meta: { title: '用户详情' }
        },
        {
          path: 'devices',
          name: 'devices',
          component: () => import('@/views/DevicesView.vue'),
          meta: { title: '设备管理' }
        },
        {
          path: 'devices/:id/logs',
          name: 'device-logs',
          component: () => import('@/views/DeviceLogsView.vue'),
          meta: { title: '设备日志' }
        },
        {
          path: 'password',
          name: 'password',
          component: () => import('@/views/PasswordView.vue'),
          meta: { title: '修改密码' }
        }
      ]
    }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public) return true
  const needAuth = to.matched.some((r) => r.meta.requiresAuth)
  if (needAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
