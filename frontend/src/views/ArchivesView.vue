<template>
  <div>
    <div class="toolbar">
      <el-input
        v-model="q"
        clearable
        placeholder="关键词（会议/议题/期次）"
        style="width: 220px"
        @keyup.enter="load"
      />
      <el-select v-model="meetingType" clearable placeholder="会议类型" style="width: 140px" @change="load">
        <el-option label="联席会" value="JOINT_CONFERENCE" />
        <el-option label="党委会" value="PARTY_COMMITTEE" />
      </el-select>
      <el-select v-model="status" clearable placeholder="状态" style="width: 120px" @change="load">
        <el-option label="已决议" value="RESOLVED" />
        <el-option label="已归档" value="ARCHIVED" />
      </el-select>
      <el-select v-model="isMajor" clearable placeholder="三重一大" style="width: 120px" @change="load">
        <el-option label="重大事项" value="true" />
        <el-option label="普通" value="false" />
      </el-select>
      <el-select v-model="isPublic" clearable placeholder="公开" style="width: 110px" @change="load">
        <el-option label="含公开决议" value="true" />
        <el-option label="未公开" value="false" />
      </el-select>
      <el-input v-model="year" clearable placeholder="学年" style="width: 100px" @keyup.enter="load" />
      <el-button type="primary" @click="load">检索</el-button>
      <el-button @click="reset">重置</el-button>
    </div>

    <el-empty v-if="!items.length" description="暂无档案（仅展示已决议/已归档会议）" />
    <el-table v-else :data="items" stripe>
      <el-table-column prop="title" label="会议" min-width="220" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          {{ row.meetingType === 'PARTY_COMMITTEE' ? '党委会' : '联席会' }}
        </template>
      </el-table-column>
      <el-table-column label="学院" width="140">
        <template #default="{ row }">{{ row.college?.name || '—' }}</template>
      </el-table-column>
      <el-table-column label="标记" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.isMajor" size="small" type="danger">重大</el-tag>
          <el-tag v-if="row.publicResolutionCount" size="small" type="success" style="margin-left: 4px">
            公开 {{ row.publicResolutionCount }}
          </el-tag>
          <span v-if="!row.isMajor && !row.publicResolutionCount" class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">{{ statusLabel(row.status) }}</template>
      </el-table-column>
      <el-table-column label="议题" width="80">
        <template #default="{ row }">{{ row.topicCount }}</template>
      </el-table-column>
      <el-table-column label="纪要生效" width="170">
        <template #default="{ row }">
          {{ row.minutesEffectiveAt ? new Date(row.minutesEffectiveAt).toLocaleString('zh-CN') : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDossier(row)">全宗</el-button>
          <el-button
            link
            type="success"
            @click="
              $router.push(
                row.meetingType === 'PARTY_COMMITTEE'
                  ? `/meetings/${row.id}?from=party`
                  : `/meetings/${row.id}`,
              )
            "
          >
            会议
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="drawer" title="会议全宗" :size="drawerSize">
      <template v-if="dossier">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="会议">{{ dossier.title }}</el-descriptions-item>
          <el-descriptions-item label="学院">{{ dossier.college?.name }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusLabel(dossier.status) }}</el-descriptions-item>
          <el-descriptions-item label="议题">
            {{ (dossier.topics || []).length }} 项
          </el-descriptions-item>
          <el-descriptions-item label="纪要">
            {{ dossier.minutes?.content || dossier.minutes?.id ? '已保存' : '未保存' }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 style="margin: 16px 0 8px">议题与决议</h4>
        <div v-for="t in dossier.topics || []" :key="t.id" class="topic-block">
          <div class="topic-title">
            <b>{{ t.title }}</b>
            <el-tag v-if="t.isMajor" size="small" type="danger">重大</el-tag>
            <el-tag v-if="t.resolution?.isPublic" size="small" type="success">公开</el-tag>
          </div>
          <div class="muted">
            决议 {{ t.resolution?.resultType || '无' }} · 材料
            {{ (t.materials || []).filter((m: any) => m.uploaded).length }}/{{
              (t.materials || []).length
            }}
          </div>
          <div v-if="t.resolution?.supervisionTasks?.length" class="muted">
            督办
            {{
              t.resolution.supervisionTasks
                .map((s: any) => `${s.title}(${s.status})`)
                .join('；')
            }}
          </div>
          <el-button link type="primary" @click="$router.push(`/topics/${t.id}`)">议题详情</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'

const items = ref<any[]>([])
const q = ref('')
const meetingType = ref('')
const status = ref('')
const isMajor = ref('')
const isPublic = ref('')
const year = ref('')
const drawer = ref(false)
const dossier = ref<any>(null)
const viewportW = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const drawerSize = computed(() => (viewportW.value < 640 ? '100%' : '520px'))

function onResize() {
  viewportW.value = window.innerWidth
}

const STATUS_MAP: Record<string, string> = {
  RESOLVED: '已决议',
  ARCHIVED: '已归档',
  SCHEDULED: '已排期',
  IN_PROGRESS: '进行中',
  ENDED: '已结束',
}
function statusLabel(s: string) {
  return STATUS_MAP[s] || s
}

async function load() {
  try {
    items.value = await http.get('/archives', {
      params: {
        ...(q.value ? { q: q.value } : {}),
        ...(meetingType.value ? { meetingType: meetingType.value } : {}),
        ...(status.value ? { status: status.value } : {}),
        ...(isMajor.value ? { isMajor: isMajor.value } : {}),
        ...(isPublic.value ? { isPublic: isPublic.value } : {}),
        ...(year.value ? { year: year.value } : {}),
      },
    })
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

function reset() {
  q.value = ''
  meetingType.value = ''
  status.value = ''
  isMajor.value = ''
  isPublic.value = ''
  year.value = ''
  load()
}

async function openDossier(row: any) {
  try {
    dossier.value = await http.get(`/archives/meetings/${row.id}`)
    drawer.value = true
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
.line {
  font-size: 13px;
  padding: 2px 0;
}
.topic-block {
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.topic-title {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}
</style>
