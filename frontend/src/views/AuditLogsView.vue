<template>
  <div>
    <div class="toolbar">
      <el-select v-model="resource" clearable placeholder="资源类型" style="width: 140px" @change="load">
        <el-option label="议题" value="Topic" />
        <el-option label="会议" value="Meeting" />
        <el-option label="纪要" value="Minutes" />
        <el-option label="名单" value="RosterMember" />
        <el-option label="用户" value="User" />
      </el-select>
      <el-input
        v-model="resourceId"
        clearable
        placeholder="资源 ID（可选）"
        style="width: 220px"
        @keyup.enter="load"
      />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="reset">重置</el-button>
    </div>

    <el-table :data="logs" stripe empty-text="暂无审计记录">
      <el-table-column label="时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString('zh-CN') }}
        </template>
      </el-table-column>
      <el-table-column label="操作人" width="120">
        <template #default="{ row }">{{ row.user?.realName || '—' }}</template>
      </el-table-column>
      <el-table-column label="学院" width="140">
        <template #default="{ row }">{{ row.college?.name || '—' }}</template>
      </el-table-column>
      <el-table-column prop="action" label="动作" width="140" />
      <el-table-column prop="resource" label="资源" width="120" />
      <el-table-column prop="resourceId" label="资源ID" min-width="160" show-overflow-tooltip />
      <el-table-column label="详情" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ formatDetail(row.detail) }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'

const logs = ref<any[]>([])
const resource = ref('')
const resourceId = ref('')

function formatDetail(d?: string) {
  if (!d) return '—'
  try {
    return JSON.stringify(JSON.parse(d))
  } catch {
    return d
  }
}

async function load() {
  try {
    logs.value = await http.get('/audit/logs', {
      params: {
        ...(resource.value ? { resource: resource.value } : {}),
        ...(resourceId.value ? { resourceId: resourceId.value } : {}),
      },
    })
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

function reset() {
  resource.value = ''
  resourceId.value = ''
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
</style>
