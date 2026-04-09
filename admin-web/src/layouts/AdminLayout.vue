<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { setAdminToken } from '../api/client'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const collapsed = ref(false)
const userMenu = ref(false)

const title = computed(() => {
  const m: Record<string, string> = {
    dashboard: '数据大屏',
    users: '用户管理',
    devices: '设备管理',
    'device-detail': '设备详情',
    'device-logs': '设备日志',
    firmware: '固件管理',
    'account-password': '修改密码'
  }
  return m[String(route.name)] || 'SmartRelay'
})

function toggleDrawer() {
  sidebarOpen.value = !sidebarOpen.value
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
}

function logout() {
  setAdminToken(null)
  router.push('/login')
}

onMounted(() => {
  document.body.classList.add('admin-body')
})
</script>

<template>
  <div
    id="admin-overlay"
    class="admin-overlay"
    :class="{ 'is-visible': sidebarOpen }"
    aria-hidden="true"
    @click="sidebarOpen = false"
  />
  <div class="admin-layout" :class="{ 'admin-layout--sidebar-collapsed': collapsed }">
    <aside
      id="admin-sidebar"
      class="admin-sidebar"
      :class="{ 'is-open': sidebarOpen }"
      aria-label="侧栏导航"
    >
      <div class="admin-sidebar__head">
        <RouterLink to="/dashboard" class="admin-sidebar__brand" title="SmartRelay 控制台">
          <span class="admin-sidebar__logo">SR</span>
          <span class="admin-sidebar__brand-txt">
            <strong>SmartRelay</strong>
            <span class="admin-sidebar__brand-sub">控制台</span>
          </span>
        </RouterLink>
        <button
          type="button"
          class="admin-sidebar__pin"
          aria-label="收起菜单"
          @click="toggleCollapse"
        >
          <svg
            class="admin-sidebar__pin-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
      </div>
      <nav class="admin-sidebar__nav">
        <RouterLink
          to="/dashboard"
          class="admin-sidebar__link"
          active-class="is-active"
          @click="sidebarOpen = false"
        >
          <svg class="admin-sidebar__ico" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
            />
          </svg>
          <span>数据大屏</span>
        </RouterLink>
        <RouterLink
          to="/users"
          class="admin-sidebar__link"
          active-class="is-active"
          @click="sidebarOpen = false"
        >
          <svg class="admin-sidebar__ico" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <span>用户管理</span>
        </RouterLink>
        <RouterLink
          to="/devices"
          class="admin-sidebar__link"
          active-class="is-active"
          @click="sidebarOpen = false"
        >
          <svg class="admin-sidebar__ico" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2-6H3m18 4h2m-2 6h2M7 19H5m14 0h2M9 7h6m-6 4h6m-6 4h6M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z"
            />
          </svg>
          <span>设备管理</span>
        </RouterLink>
        <RouterLink
          to="/firmware"
          class="admin-sidebar__link"
          active-class="is-active"
          @click="sidebarOpen = false"
        >
          <svg class="admin-sidebar__ico" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
            />
          </svg>
          <span>固件管理</span>
        </RouterLink>
      </nav>
    </aside>

    <div class="admin-main-col">
      <header class="admin-topbar">
        <div class="admin-topbar__left">
          <button type="button" class="admin-drawer-toggle lg:hidden" aria-label="打开菜单" @click="toggleDrawer">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 class="admin-topbar__title">{{ title }}</h1>
        </div>
        <div class="flex items-center gap-3">
          <div class="admin-user-menu" :class="{ 'is-open': userMenu }">
            <button
              type="button"
              class="admin-user-trigger"
              aria-expanded="false"
              @click="userMenu = !userMenu"
            >
              <span class="admin-user-trigger__dot" />
              <span class="admin-user-trigger__name">admin</span>
              <svg class="admin-user-trigger__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div v-show="userMenu" class="admin-user-panel" role="menu">
              <RouterLink to="/account/password" class="admin-user-panel__item" role="menuitem" @click="userMenu = false">修改密码</RouterLink>
              <button type="button" class="admin-user-panel__item admin-user-panel__item--danger" role="menuitem" @click="logout">
                退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      <main class="admin-content admin-content--datagrid">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.flex {
  display: flex;
}
.items-center {
  align-items: center;
}
.gap-3 {
  gap: 0.75rem;
}
.lg\:hidden {
}
@media (min-width: 1024px) {
  .lg\:hidden {
    display: none !important;
  }
}
.w-6 {
  width: 1.5rem;
}
.h-6 {
  height: 1.5rem;
}
</style>
