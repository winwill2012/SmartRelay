<template>
  <el-card shadow="never">
    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="device_sn" label="device_sn" min-width="140" />
      <el-table-column prop="remark_name" label="备注" min-width="120" />
      <el-table-column label="在线" width="100">
        <template #default="{ row }">
          <el-tag :type="row.online ? 'success' : 'info'">{{ row.online ? '在线' : '离线' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="relay_state" label="继电器" width="100">
        <template #default="{ row }">{{ row.relay_state ? '开' : '关' }}</template>
      </el-table-column>
      <el-table-column prop="owner_user_id" label="所有者 user_id" min-width="200" show-overflow-tooltip />
      <el-table-column prop="last_seen_at" label="last_seen_at" min-width="200" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="goLogs(row.device_id)">日志</el-button>
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
import { getAdminDevices, type AdminDeviceRow } from '@/api/admin'

const router = useRouter()
const loading = ref(false)
const rows = ref<AdminDeviceRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

async function fetch() {
  loading.value = true
  try {
    const data = await getAdminDevices({ page: page.value, page_size: pageSize })
    rows.value = data.items
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function goLogs(id: string) {
  router.push({ name: 'device-logs', params: { id } })
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
