<template>
  <el-card shadow="never">
    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="created_at" label="时间" min-width="200" />
      <el-table-column prop="action" label="动作" width="140" />
      <el-table-column prop="source" label="来源" width="120" />
      <el-table-column prop="cmd_id" label="cmd_id" min-width="260" show-overflow-tooltip />
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
import { useRoute } from 'vue-router'
import { getAdminDeviceLogs, type OperationLogRow } from '@/api/admin'

const route = useRoute()
const loading = ref(false)
const rows = ref<OperationLogRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

async function fetch() {
  loading.value = true
  try {
    const data = await getAdminDeviceLogs(route.params.id as string, {
      page: page.value,
      page_size: pageSize
    })
    rows.value = data.items
    total.value = data.total
  } finally {
    loading.value = false
  }
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
