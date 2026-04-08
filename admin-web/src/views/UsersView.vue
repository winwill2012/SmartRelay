<template>
  <el-card shadow="never">
    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="nickname" label="昵称" min-width="120" />
      <el-table-column prop="wx_openid" label="OpenID" min-width="200" show-overflow-tooltip />
      <el-table-column prop="created_at" label="注册时间" min-width="180" />
      <el-table-column prop="last_login_at" label="最后登录" min-width="180" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="goDetail(row.user_id)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager">
      <el-pagination
        background
        layout="prev, pager, next"
        :total="total"
        :page-size="pageSize"
        v-model:current-page="page"
        @current-change="fetch"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getAdminUsers, type AdminUserRow } from '@/api/admin'

const router = useRouter()
const loading = ref(false)
const rows = ref<AdminUserRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

async function fetch() {
  loading.value = true
  try {
    const data = await getAdminUsers({ page: page.value, page_size: pageSize })
    rows.value = data.items
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function goDetail(id: string) {
  router.push({ name: 'user-detail', params: { id } })
}

onMounted(fetch)
</script>

<style scoped lang="scss">
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
