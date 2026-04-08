<template>
  <el-card v-loading="loading" shadow="never">
    <template v-if="user">
      <el-descriptions title="用户信息" :column="2" border>
        <el-descriptions-item label="用户 ID">{{ user.user_id }}</el-descriptions-item>
        <el-descriptions-item label="昵称">{{ user.nickname || '—' }}</el-descriptions-item>
        <el-descriptions-item label="OpenID">{{ user.wx_openid || '—' }}</el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ user.created_at || '—' }}</el-descriptions-item>
        <el-descriptions-item label="最后登录">{{ user.last_login_at || '—' }}</el-descriptions-item>
      </el-descriptions>

      <h3 class="section-title">名下设备</h3>
      <el-table :data="user.devices || []" stripe>
        <el-table-column prop="device_sn" label="SN" />
        <el-table-column prop="remark_name" label="备注">
          <template #default="{ row }">{{ row.remark_name || '—' }}</template>
        </el-table-column>
        <el-table-column label="在线">
          <template #default="{ row }">
            <el-tag :type="row.online ? 'success' : 'info'">{{ row.online ? '在线' : '离线' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getAdminUser, type AdminUserDetail } from '@/api/admin'

const route = useRoute()
const loading = ref(false)
const user = ref<AdminUserDetail | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    user.value = await getAdminUser(route.params.id as string)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="scss">
.section-title {
  margin: 24px 0 12px;
  font-size: 16px;
  color: #e2e8f0;
}
</style>
