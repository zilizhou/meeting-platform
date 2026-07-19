<template>
  <div>
    <div class="toolbar">
      <el-button
        v-if="!isViewerOnly"
        type="warning"
        :loading="scanning"
        @click="scan"
      >
        扫描逾期
      </el-button>
      <el-button @click="load">刷新</el-button>
      <el-tag v-if="overdueCount" type="danger">逾期 {{ overdueCount }}</el-tag>
      <el-tag v-if="isViewerOnly" type="info">只读查阅</el-tag>
    </div>

    <el-table :data="tasks" stripe>
      <el-table-column label="督办事项" min-width="220">
        <template #default="{ row }">{{ row.title }}</template>
      </el-table-column>
      <el-table-column label="学院" width="140">
        <template #default="{ row }">
          {{ row.resolution?.topic?.college?.name || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="责任人" width="120">
        <template #default="{ row }">{{ row.owner?.realName }}</template>
      </el-table-column>
      <el-table-column label="截止时间" width="170">
        <template #default="{ row }">
          <span :class="{ overdue: isOverdue(row) }">
            {{ row.dueAt ? new Date(row.dueAt).toLocaleString('zh-CN') : '—' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status)">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="反馈数" width="90">
        <template #default="{ row }">{{ row.feedbacks?.length || 0 }}</template>
      </el-table-column>
      <el-table-column label="催办" width="100">
        <template #default="{ row }">
          <span v-if="row.urgeCount">{{ row.urgeCount }} 次</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="340">
        <template #default="{ row }">
          <el-button
            v-if="canUrge(row)"
            link
            type="warning"
            :disabled="row.status === 'DONE'"
            @click="urge(row)"
          >
            催办
          </el-button>
          <el-button
            v-if="canAct(row)"
            link
            type="primary"
            :disabled="row.status === 'DONE'"
            @click="feedback(row)"
          >
            反馈
          </el-button>
          <el-button
            v-if="canAct(row)"
            link
            type="success"
            :disabled="row.status === 'DONE'"
            @click="complete(row)"
          >
            办结
          </el-button>
          <el-button
            v-if="canAct(row)"
            link
            type="danger"
            :disabled="row.status === 'DONE' || row.status === 'ADJUST_REQUEST'"
            @click="requestAdjust(row)"
          >
            重大调整
          </el-button>
          <span v-if="!canAct(row) && !canUrge(row)" class="muted">仅责任人/管理员可操作</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'

const router = useRouter()
const roles = useRoles()
const tasks = ref<any[]>([])
const scanning = ref(false)

const isViewerOnly = computed(
  () => roles.isSchoolViewer.value && !roles.isSchoolAdmin.value,
)

const overdueCount = computed(
  () => tasks.value.filter((t) => t.status === 'OVERDUE').length,
)

function canAct(row: any) {
  if (roles.isSchoolAdmin.value) return true
  if (row.owner?.id && row.owner.id === roles.auth.user?.id) return true
  return roles.isStaff.value
}

function canUrge(row: any) {
  if (roles.isSchoolAdmin.value) return true
  return (
    roles.isStaff.value ||
    roles.isSecretary.value ||
    roles.isDean.value
  )
}

const STATUS_MAP: Record<string, string> = {
  PENDING: '待办',
  ACCEPTED: '已接收',
  IN_PROGRESS: '推进中',
  FEEDBACK: '已反馈',
  DONE: '已办结',
  OVERDUE: '已逾期',
  ADJUST_REQUEST: '申请调整',
}

function statusLabel(s: string) {
  return STATUS_MAP[s] || s
}
function statusType(s: string) {
  if (s === 'DONE') return 'success'
  if (s === 'OVERDUE') return 'danger'
  if (s === 'FEEDBACK') return 'warning'
  return 'info'
}
function isOverdue(row: any) {
  return row.status === 'OVERDUE'
}

async function load() {
  tasks.value = await http.get('/supervisions')
}

async function scan() {
  scanning.value = true
  try {
    const res: any = await http.post('/supervisions/scan-overdue')
    ElMessage.success(
      res.marked > 0
        ? `已标记逾期 ${res.marked} 条，当前逾期 ${res.overdueCount} 条`
        : `无新增逾期，当前逾期 ${res.overdueCount} 条`,
    )
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    scanning.value = false
  }
}

async function feedback(row: any) {
  try {
    const { value } = await ElMessageBox.prompt('请输入反馈内容', '督办反馈')
    await http.post(`/supervisions/${row.id}/feedback`, { content: value })
    ElMessage.success('已反馈')
    await load()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(String(e))
  }
}

async function complete(row: any) {
  try {
    await http.post(`/supervisions/${row.id}/complete`)
    ElMessage.success('已办结')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function urge(row: any) {
  try {
    const res: any = await http.post(`/supervisions/${row.id}/urge`)
    ElMessage.success(`已催办（第 ${res.urgeCount} 次）`)
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function requestAdjust(row: any) {
  try {
    const { value } = await ElMessageBox.prompt(
      '重大调整须回流新议题重新上会，不得直接改原决议。请填写调整理由：',
      '申请重大调整',
    )
    const res: any = await http.post(`/supervisions/${row.id}/request-adjust`, {
      content: value,
    })
    ElMessage.success(res.message || '已回流新议题')
    await load()
    if (res.newTopicId) {
      router.push(`/topics/${res.newTopicId}`)
    }
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(String(e))
  }
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
.overdue {
  color: #dc2626;
  font-weight: 600;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>
