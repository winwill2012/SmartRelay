<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="brand">
        <span class="dot" />
        <span>SmartRelay</span>
      </div>
      <el-menu
        :default-active="active"
        router
        background-color="transparent"
        text-color="#cbd5e1"
        active-text-color="#38bdf8"
      >
        <el-menu-item index="/dashboard">
          <span>数据大屏</span>
        </el-menu-item>
        <el-menu-item index="/users">
          <span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/devices">
          <span>设备管理</span>
        </el-menu-item>
        <el-menu-item index="/password">
          <span>修改密码</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="title">{{ title }}</div>
        <el-button text type="primary" @click="logout">退出</el-button>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const active = computed(() => {
  const p = route.path
  if (p.startsWith('/users')) return '/users'
  if (p.startsWith('/devices')) return '/devices'
  if (p.startsWith('/password')) return '/password'
  return '/dashboard'
})
const title = computed(() => (route.meta.title as string) || '')

function logout() {
  auth.clear()
  router.push({ name: 'login' })
}
</script>

<style scoped lang="scss">
.layout {
  min-height: 100vh;
}

.aside {
  padding: 20px 12px;
  border-right: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(12px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-bottom: 24px;
  padding: 0 8px;
  color: #e2e8f0;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.7);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
}

.title {
  font-size: 18px;
  font-weight: 600;
}

.main {
  padding: 24px;
}
</style>
