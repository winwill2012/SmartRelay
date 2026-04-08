<template>
  <div class="dash">
    <el-row :gutter="16">
      <el-col v-for="card in cards" :key="card.key" :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">{{ card.label }}</div>
          <div class="stat-value">{{ stats[card.key] ?? '—' }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="chart-card" shadow="never">
      <template #header>
        <span>今日指令趋势（UTC 自然日，按小时）</span>
      </template>
      <div v-if="(stats.series || []).length === 0" class="empty-hint">暂无数据</div>
      <div v-else class="bars">
        <div v-for="b in stats.series || []" :key="b.hour" class="bar-wrap">
          <div class="bar" :style="{ height: `${barHeightPx(b.commands)}px` }" />
          <div class="hour">{{ b.hour }}时</div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { getDashboard, type DashboardData } from '@/api/admin'

const stats = reactive<DashboardData>({
  user_count: 0,
  device_count: 0,
  online_count: 0,
  today_command_count: 0,
  series: []
})

const cards = [
  { key: 'user_count' as const, label: '用户数' },
  { key: 'device_count' as const, label: '设备数' },
  { key: 'online_count' as const, label: '在线设备' },
  { key: 'today_command_count' as const, label: '今日指令' }
]

const maxCommands = computed(() => {
  const s = stats.series || []
  if (!s.length) return 1
  return Math.max(1, ...s.map((x) => x.commands))
})

function barHeightPx(commands: number) {
  return Math.max(8, Math.round((commands / maxCommands.value) * 100))
}

onMounted(async () => {
  const data = await getDashboard()
  Object.assign(stats, data)
})
</script>

<style scoped lang="scss">
.dash {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stat-card {
  margin-bottom: 16px;
}

.stat-label {
  color: #94a3b8;
  font-size: 14px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #f8fafc;
}

.chart-card {
  margin-top: 8px;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  min-height: 140px;
  padding: 8px 0;
}

.bar-wrap {
  flex: 1;
  text-align: center;
}

.bar {
  margin: 0 auto 8px;
  width: 100%;
  max-width: 48px;
  background: linear-gradient(180deg, #38bdf8, #6366f1);
  border-radius: 8px 8px 2px 2px;
  min-height: 8px;
}

.hour {
  font-size: 12px;
  color: #94a3b8;
}

.empty-hint {
  color: #94a3b8;
  padding: 24px;
  text-align: center;
}
</style>
