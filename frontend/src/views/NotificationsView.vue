<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="markAll">全部已读</el-button>
      <el-button @click="load">刷新</el-button>
      <el-tag type="warning">未读 {{ unread }}</el-tag>
    </div>

    <el-empty v-if="!items.length" description="暂无消息" />
    <el-table v-else :data="items" stripe @row-click="onRow">
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.readAt ? 'info' : 'danger'">
            {{ row.readAt ? '已读' : '未读' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="240" />
      <el-table-column prop="content" label="内容" min-width="200" />
      <el-table-column label="时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString('zh-CN') }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="go(row)">打开</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'

const router = useRouter()
const items = ref<any[]>([])
const unread = ref(0)

async function load() {
  items.value = await http.get('/notifications')
  const c: any = await http.get('/notifications/unread-count')
  unread.value = c.count || 0
}

async function markAll() {
  await http.post('/notifications/read-all')
  ElMessage.success('已全部标为已读')
  await load()
}

async function onRow(row: any) {
  if (!row.readAt) {
    await http.post(`/notifications/${row.id}/read`)
  }
  await go(row)
}

async function go(row: any) {
  if (!row.readAt) {
    await http.post(`/notifications/${row.id}/read`)
  }
  if (row.link) router.push(row.link)
  await load()
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
</style>
