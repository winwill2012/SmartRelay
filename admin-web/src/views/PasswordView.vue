<template>
  <el-card class="pwd-card" shadow="never">
    <el-form :model="form" label-width="100px" @submit.prevent="submit">
      <el-form-item label="当前密码">
        <el-input v-model="form.old_password" type="password" show-password autocomplete="current-password" />
      </el-form-item>
      <el-form-item label="新密码">
        <el-input v-model="form.new_password" type="password" show-password autocomplete="new-password" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading">保存</el-button>
      </el-form-item>
    </el-form>
    <p class="hint">POST /api/v1/admin/password，请求体字段以后端实现为准（此处为 old_password / new_password）。</p>
  </el-card>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminChangePassword } from '@/api/admin'

const loading = ref(false)
const form = reactive({
  old_password: '',
  new_password: ''
})

async function submit() {
  loading.value = true
  try {
    await adminChangePassword({ ...form })
    ElMessage.success('已更新密码')
    form.old_password = ''
    form.new_password = ''
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.pwd-card {
  max-width: 520px;
}

.hint {
  margin-top: 16px;
  color: #94a3b8;
  font-size: 13px;
}
</style>
