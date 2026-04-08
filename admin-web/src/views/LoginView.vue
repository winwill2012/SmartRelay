<template>
  <div class="login-page">
    <div class="panel">
      <h1>SmartRelay 管理后台</h1>
      <p class="sub">默认账号 admin / admin123（与协议初始化一致）</p>
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item label="用户名">
          <el-input v-model="form.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-button type="primary" class="btn" :loading="loading" native-type="submit">登录</el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminLogin } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const loading = ref(false)
const form = reactive({
  username: 'admin',
  password: 'admin123'
})

async function submit() {
  loading.value = true
  try {
    const data = await adminLogin({ ...form })
    if (data.token) {
      auth.setSession(data.token, data.admin?.username || form.username)
    }
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.replace(redirect)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.panel {
  width: 100%;
  max-width: 420px;
  padding: 32px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
}

h1 {
  margin: 0 0 8px;
  font-size: 24px;
  color: #f8fafc;
}

.sub {
  margin: 0 0 24px;
  color: #94a3b8;
  font-size: 14px;
}

.btn {
  width: 100%;
  margin-top: 8px;
}
</style>
