<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { fetchAdminMe, getAdminRole, getAdminUsername, setAdminProfile, setAdminToken } from '../api/client'

const COLLAPSE_KEY = 'smartrelay-admin-sidebar-collapsed'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const collapsed = ref(false)
const userMenu = ref(false)
const displayName = ref('admin')
const settingsOpen = ref(false)

const isAdminRole = computed(() => getAdminRole() === 'admin')

const settingsRouteActive = computed(() => String(route.path).includes('/settings'))

const title = computed(() => {
  const m: Record<string, string> = {
    dashboard: '数据大屏',
    users: '用户管理',
    devices: '设备管理',
    'device-detail': '设备详情',
    'device-logs': '设备日志',
    firmware: '固件管理',
    'settings-password': '修改密码',
    'settings-accounts': '账号管理',
    'settings-logs': '系统日志'
  }
  return m[String(route.name)] || '一念开合'
})

const isDashboard = computed(() => route.name === 'dashboard')

const mainClasses = computed(() =>
  route.name === 'dashboard' ? 'admin-content' : 'admin-content admin-content--datagrid'
)

function mqDesktop() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
}

function toggleDrawer() {
  sidebarOpen.value = !sidebarOpen.value
}

function persistCollapsed(c: boolean) {
  if (!mqDesktop()) return
  try {
    localStorage.setItem(COLLAPSE_KEY, c ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function toggleCollapse() {
  if (!mqDesktop()) return
  collapsed.value = !collapsed.value
  persistCollapsed(collapsed.value)
}

function onResize() {
  if (!mqDesktop()) {
    collapsed.value = false
  }
}

function closeUserMenu() {
  userMenu.value = false
}

function toggleUserMenu(e: MouseEvent) {
  e.stopPropagation()
  userMenu.value = !userMenu.value
}

function onDocClick() {
  closeUserMenu()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (sidebarOpen.value && !mqDesktop()) {
      sidebarOpen.value = false
      return
    }
    if (userMenu.value) {
      closeUserMenu()
      const el = document.getElementById('admin-user-trigger')
      el?.focus()
    }
  }
}

function logout() {
  setAdminToken(null)
  router.push('/login')
}

watch(sidebarOpen, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open && !mqDesktop() ? 'hidden' : ''
})

watch(
  () => route.path,
  (p) => {
    if (p.includes('/settings')) settingsOpen.value = true
  },
  { immediate: true }
)

onMounted(() => {
  document.body.classList.add('admin-body')
  displayName.value = getAdminUsername() || 'admin'
  void (async () => {
    try {
      const me = await fetchAdminMe()
      setAdminProfile(me.username, me.role)
      displayName.value = me.username
    } catch {
      /* 离线或 token 异常时沿用本地缓存 */
    }
  })()
  try {
    if (mqDesktop() && localStorage.getItem(COLLAPSE_KEY) === '1') {
      collapsed.value = true
    }
  } catch {
    /* ignore */
  }
  window.addEventListener('resize', onResize)
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.body.classList.remove('admin-body')
  document.body.style.overflow = ''
  window.removeEventListener('resize', onResize)
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
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
        <RouterLink to="/dashboard" class="admin-sidebar__brand" title="一念开合 控制台" @click="sidebarOpen = false">
          <span class="admin-sidebar__logo">SR</span>
          <span class="admin-sidebar__brand-txt">
            <strong>一念开合</strong>
            <span class="admin-sidebar__brand-sub">控制台</span>
          </span>
        </RouterLink>
        <button
          id="admin-sidebar-toggle"
          type="button"
          class="admin-sidebar__pin"
          :aria-label="collapsed ? '展开菜单' : '收起菜单'"
          :aria-expanded="collapsed ? 'false' : 'true'"
          @click="toggleCollapse"
        >
          <svg class="admin-sidebar__pin-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
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
          <svg class="admin-sidebar__ico" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
            />
          </svg>
          <span>数据大屏</span>
        </RouterLink>
        <RouterLink to="/users" class="admin-sidebar__link" active-class="is-active" @click="sidebarOpen = false">
          <svg class="admin-sidebar__ico" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <span>用户管理</span>
        </RouterLink>
        <RouterLink to="/devices" class="admin-sidebar__link" active-class="is-active" @click="sidebarOpen = false">
          <svg class="admin-sidebar__ico" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2-6H3m18 4h2m-2 6h2M7 19H5m14 0h2M9 7h6m-6 4h6m-6 4h6M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z"
            />
          </svg>
          <span>设备管理</span>
        </RouterLink>
        <RouterLink to="/firmware" class="admin-sidebar__link" active-class="is-active" @click="sidebarOpen = false">
          <svg class="admin-sidebar__ico" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
            />
          </svg>
          <span>固件管理</span>
        </RouterLink>

        <div v-if="isAdminRole" class="admin-sidebar__group">
          <button
            type="button"
            class="admin-sidebar__link admin-sidebar__group-btn"
            :class="{ 'is-active': settingsRouteActive, 'is-open': settingsOpen }"
            :aria-expanded="settingsOpen ? 'true' : 'false'"
            @click="settingsOpen = !settingsOpen"
          >
            <svg class="admin-sidebar__ico" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>系统设置</span>
            <svg class="admin-sidebar__chev" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div v-show="settingsOpen" class="admin-sidebar__sub">
            <RouterLink
              to="/settings/password"
              class="admin-sidebar__sublink"
              active-class="router-link-active"
              @click="sidebarOpen = false"
            >
              修改密码
            </RouterLink>
            <RouterLink
              to="/settings/accounts"
              class="admin-sidebar__sublink"
              active-class="router-link-active"
              @click="sidebarOpen = false"
            >
              账号管理
            </RouterLink>
            <RouterLink
              to="/settings/logs"
              class="admin-sidebar__sublink"
              active-class="router-link-active"
              @click="sidebarOpen = false"
            >
              系统日志
            </RouterLink>
          </div>
        </div>
      </nav>
    </aside>

    <div class="admin-main-col">
      <header class="admin-topbar">
        <div class="admin-topbar__left">
          <button type="button" class="admin-drawer-toggle lg:hidden" aria-label="打开菜单" @click="toggleDrawer">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 class="admin-topbar__title">{{ title }}</h1>
        </div>
        <div class="flex items-center gap-3">
          <span v-if="isDashboard" class="hidden sm:inline text-xs font-medium text-slate-500">数据每分钟更新</span>
          <div class="admin-user-menu" :class="{ 'is-open': userMenu }" @click.stop>
            <button
              id="admin-user-trigger"
              type="button"
              class="admin-user-trigger"
              aria-haspopup="true"
              aria-controls="admin-user-dropdown"
              :aria-expanded="userMenu ? 'true' : 'false'"
              @click="toggleUserMenu"
            >
              <span class="admin-user-trigger__dot" aria-hidden="true" />
              <span class="admin-user-trigger__name">{{ displayName }}</span>
              <svg
                class="admin-user-trigger__chevron"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div id="admin-user-dropdown" class="admin-user-panel" role="menu">
              <RouterLink
                to="/settings/password"
                class="admin-user-panel__item"
                role="menuitem"
                :aria-current="route.name === 'settings-password' ? 'page' : undefined"
                @click="closeUserMenu"
              >
                修改密码
              </RouterLink>
              <button
                type="button"
                class="admin-user-panel__item admin-user-panel__item--danger"
                role="menuitem"
                @click="logout"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      <main :class="mainClasses">
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
.hidden {
  display: none;
}
@media (min-width: 640px) {
  .sm\:inline {
    display: inline;
  }
}
.w-6 {
  width: 1.5rem;
}
.h-6 {
  height: 1.5rem;
}
</style>
