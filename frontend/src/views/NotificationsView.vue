<template>
  <div class="notify-page">
    <div class="toolbar">
      <el-button type="primary" @click="markAll">全部已读</el-button>
      <el-button @click="load">刷新</el-button>
      <el-tag type="warning">未读 {{ unread }}</el-tag>
    </div>

    <el-empty v-if="!items.length" description="暂无消息" />
    <div v-else class="n-list">
      <button
        v-for="row in items"
        :key="row.id"
        type="button"
        class="n-card"
        :class="{ unread: !row.readAt }"
        @click="onRow(row)"
      >
        <div class="n-top">
          <el-tag size="small" :type="row.readAt ? 'info' : 'danger'">
            {{ row.readAt ? '已读' : '未读' }}
          </el-tag>
          <time>{{ formatTime(row.createdAt) }}</time>
        </div>
        <strong>{{ row.title }}</strong>
        <p>{{ row.content }}</p>
        <span v-if="row.link" class="n-go">查看详情</span>
      </button>
    </div>
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

function formatTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN')
}

onMounted(load)
</script>

<style scoped>
.notify-page {
  min-width: 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.n-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.n-card {
  width: 100%;
  display: block;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  padding: 12px 14px;
  box-shadow: 0 4px 14px rgba(15, 45, 75, 0.05);
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.n-card.unread {
  border-color: #f0c9a8;
  background: linear-gradient(180deg, #fffaf5 0%, #fff 48%);
}
.n-card:active {
  transform: scale(0.995);
}
.n-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.n-top time {
  font-size: 12px;
  color: #8a97a8;
  flex-shrink: 0;
}
.n-card strong {
  display: block;
  font-size: 15px;
  line-height: 1.4;
  color: #1a2b3c;
}
.n-card p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: #5b6b7c;
  white-space: pre-wrap;
  word-break: break-word;
}
.n-go {
  display: inline-block;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 700;
  color: #1a5f8a;
}
</style>
