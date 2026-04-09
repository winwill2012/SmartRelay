import { createRouter, createWebHistory } from 'vue-router'
import { getAdminToken } from '../api/client'

const LoginView = () => import('../views/LoginView.vue')
const AdminLayout = () => import('../layouts/AdminLayout.vue')
const DashboardView = () => import('../views/DashboardView.vue')
const UsersView = () => import('../views/UsersView.vue')
const DevicesView = () => import('../views/DevicesView.vue')
const DeviceDetailView = () => import('../views/DeviceDetailView.vue')
const DeviceLogsView = () => import('../views/DeviceLogsView.vue')
const FirmwareView = () => import('../views/FirmwareView.vue')
const AccountPasswordView = () => import('../views/AccountPasswordView.vue')

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    {
      path: '/',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: DashboardView },
        { path: 'users', name: 'users', component: UsersView },
        { path: 'devices', name: 'devices', component: DevicesView },
        { path: 'devices/:id', name: 'device-detail', component: DeviceDetailView },
        { path: 'devices/:id/logs', name: 'device-logs', component: DeviceLogsView },
        { path: 'firmware', name: 'firmware', component: FirmwareView },
        { path: 'account/password', name: 'account-password', component: AccountPasswordView }
      ]
    }
  ]
})

router.beforeEach((to) => {
  if (to.meta.public) return true
  if (to.meta.requiresAuth && !getAdminToken()) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})
