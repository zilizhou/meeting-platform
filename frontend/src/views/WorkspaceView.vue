<template>
  <div class="workspace">
    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <span>我的待办</span>
          <el-button text type="primary" @click="load">刷新</el-button>
        </div>
      </template>
      <div class="stats">
        <div><b>{{ summary.total }}</b><span>全部</span></div>
        <div><b>{{ summary.jointReview }}</b><span>联席双审</span></div>
        <div><b>{{ summary.partyReview }}</b><span>党委审题</span></div>
        <div><b>{{ summary.supervision }}</b><span>督办</span></div>
        <div><b>{{ summary.materialRead }}</b><span>待签收</span></div>
      </div>
    </el-card>

    <el-card shadow="never" class="rules-card">
      <template #header>
        <div class="card-head">
          <span>议事规则问答</span>
          <el-tag size="small" :type="aiConfigured ? 'success' : 'warning'">
            {{ aiConfigured ? '大模型+知识库' : '知识库检索' }}
          </el-tag>
        </div>
      </template>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
        title="基于〔2021〕20号议事规则及系统落地口径。回答供参考，以正式文件与组织部门解释为准；AI 不替代审签。"
      />
      <div class="ask-row">
        <el-input
          v-model="ruleQuestion"
          clearable
          placeholder="例如：纪要如何整理归档？重大事项如何办理？"
          @keyup.enter="askRule"
        />
        <el-button type="primary" :loading="ruleAsking" @click="askRule">提问</el-button>
      </div>
      <div class="quick-asks">
        <el-button
          v-for="q in quickQuestions"
          :key="q"
          size="small"
          @click="askPreset(q)"
        >
          {{ q }}
        </el-button>
      </div>
      <div v-if="ruleAnswer" class="rule-answer">
        <pre>{{ ruleAnswer.outputText }}</pre>
        <div v-if="ruleAnswer.citations?.length" class="citations">
          <div class="cite-title">引用出处</div>
          <div v-for="c in ruleAnswer.citations" :key="c.id" class="cite-item">
            <b>{{ c.title }}</b>
            <span class="muted"> · {{ c.source }}</span>
          </div>
        </div>
      </div>
    </el-card>

    <div class="flow-grid">
      <el-card v-for="board in boards" :key="board.key" shadow="never" class="flow-card">
        <template #header>
          <div class="card-head">
            <span>{{ board.title }}</span>
            <el-tag size="small" type="info">进行中 {{ board.items.length }}</el-tag>
          </div>
        </template>

        <el-steps :active="highlightStep(board)" align-center finish-status="success">
          <el-step
            v-for="(s, idx) in board.steps"
            :key="s.key"
            :title="s.label"
            :description="stepDesc(board, s, idx)"
          />
        </el-steps>

        <div class="stage-chips">
          <button
            v-for="s in board.stageStats"
            :key="s.key"
            type="button"
            class="chip"
            :class="{ active: board.filter === s.key, muted: !s.count }"
            @click="toggleFilter(board, s.key)"
          >
            <b>{{ s.count }}</b>
            <span>{{ s.label }}</span>
          </button>
        </div>

        <el-empty
          v-if="!filteredItems(board).length"
          description="当前无进行中事项"
          :image-size="56"
        />
        <div v-else class="flow-list">
          <div
            v-for="item in filteredItems(board)"
            :key="item.topicId"
            class="flow-item"
            @click="goTopic(item)"
          >
            <div class="flow-item-main">
              <div class="flow-title">
                {{ item.title }}
                <el-tag v-if="item.isMajor" size="small" type="danger">重大</el-tag>
                <el-tag v-if="item.isEmergency" size="small" type="warning">紧急</el-tag>
                <el-tag v-if="item.isTempMotion" size="small" type="info">临时</el-tag>
              </div>
              <div class="flow-meta">
                {{ item.collegeName || '本院' }} · 当前：{{ item.stageLabel }}
              </div>
            </div>
            <el-button link type="primary">查看</el-button>
          </div>
        </div>
      </el-card>
    </div>

    <el-card shadow="never">
      <template #header>待办清单</template>
      <el-empty v-if="!items.length" description="暂无待办" />
      <el-table v-else :data="items" stripe>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="typeTag(row.type)">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="事项" min-width="260" />
        <el-table-column prop="subtitle" label="说明" min-width="180" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="go(row)">处理</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'

interface TodoItem {
  id: string
  type: string
  title: string
  subtitle?: string
  meetingType?: string
  topicId?: string
  meetingId?: string
  taskId?: string
}

interface FlowItem {
  topicId: string
  meetingId?: string | null
  title: string
  meetingType: string
  collegeName?: string
  stageKey: string
  stageLabel: string
  stepIndex: number
  isMajor?: boolean
  isEmergency?: boolean
  isTempMotion?: boolean
  link: string
}

interface FlowBoard {
  key: string
  title: string
  steps: { key: string; label: string }[]
  stageStats: { key: string; label: string; count: number }[]
  items: FlowItem[]
  filter: string
}

const router = useRouter()
const items = ref<TodoItem[]>([])
const summary = reactive({
  total: 0,
  jointReview: 0,
  partyReview: 0,
  minutesSign: 0,
  supervision: 0,
  checkin: 0,
  materialRead: 0,
})

const aiConfigured = ref(false)
const ruleQuestion = ref('')
const ruleAsking = ref(false)
const ruleAnswer = ref<any>(null)
const quickQuestions = [
  '缺席书面意见算不算票？',
  '列席有没有表决权？',
  '临时动议要谁同意？',
  '会议纪要如何保存归档？',
  '重大事项法定人数是多少？',
]

const jointBoard = reactive<FlowBoard>({
  key: 'joint',
  title: '党政联席会议流程',
  steps: [],
  stageStats: [],
  items: [],
  filter: '',
})
const partyBoard = reactive<FlowBoard>({
  key: 'party',
  title: '学院党组织会议流程',
  steps: [],
  stageStats: [],
  items: [],
  filter: '',
})

const boards = computed(() => [jointBoard, partyBoard])

function typeLabel(type: string) {
  const map: Record<string, string> = {
    JOINT_REVIEW: '联席双审',
    PARTY_REVIEW: '党委审题',
    MINUTES: '整理纪要',
    MINUTES_SIGN: '整理纪要',
    SUPERVISION: '督办',
    CHECKIN: '签到',
    MATERIAL_READ: '材料签收',
  }
  return map[type] || type
}

function typeTag(type: string) {
  const map: Record<string, string> = {
    JOINT_REVIEW: 'warning',
    PARTY_REVIEW: 'danger',
    MINUTES_SIGN: '',
    SUPERVISION: 'success',
    CHECKIN: 'info',
    MATERIAL_READ: 'warning',
  }
  return map[type] || 'info'
}

function highlightStep(board: FlowBoard) {
  if (!board.items.length) return 0
  const max = Math.max(...board.items.map((i) => i.stepIndex ?? 0))
  return Math.max(0, max)
}

function stepDesc(board: FlowBoard, s: { key: string }, idx: number) {
  const count = board.stageStats.find((x) => x.key === s.key)?.count || 0
  if (!count) return idx === highlightStep(board) ? '当前关注' : ''
  return `${count} 项`
}

function toggleFilter(board: FlowBoard, key: string) {
  board.filter = board.filter === key ? '' : key
}

function filteredItems(board: FlowBoard) {
  if (!board.filter) return board.items
  return board.items.filter((i) => i.stageKey === board.filter)
}

function goTopic(item: FlowItem) {
  router.push(item.link)
}

function go(row: TodoItem) {
  if (row.type === 'SUPERVISION') {
    router.push('/supervisions')
    return
  }
  if (row.topicId) {
    const from = row.meetingType === 'PARTY_COMMITTEE' ? 'party' : undefined
    router.push(from ? `/topics/${row.topicId}?from=party` : `/topics/${row.topicId}`)
    return
  }
  if (row.meetingId) {
    const from = row.meetingType === 'PARTY_COMMITTEE' ? 'party' : undefined
    router.push(
      from ? `/meetings/${row.meetingId}?from=party` : `/meetings/${row.meetingId}`,
    )
  }
}

function applyBoard(target: FlowBoard, data: any) {
  target.title = data.title || target.title
  target.steps = data.steps || []
  target.stageStats = data.stageStats || []
  target.items = data.items || []
}

async function load() {
  try {
    const [todos, flow] = (await Promise.all([
      http.get('/workspace/todos'),
      http.get('/workspace/flow-board'),
    ])) as any[]
    Object.assign(summary, todos.summary)
    items.value = todos.items || []
    applyBoard(jointBoard, flow.joint || {})
    applyBoard(partyBoard, flow.party || {})
  } catch (e: any) {
    ElMessage.error(String(e))
  }
  try {
    const st: any = await http.get('/ai/status')
    aiConfigured.value = !!st.configured
  } catch {
    aiConfigured.value = false
  }
}

function askPreset(q: string) {
  ruleQuestion.value = q
  askRule()
}

async function askRule() {
  const q = ruleQuestion.value.trim()
  if (q.length < 2) {
    ElMessage.warning('请输入问题')
    return
  }
  ruleAsking.value = true
  try {
    ruleAnswer.value = await http.post('/ai/rules/ask', { question: q })
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    ruleAsking.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.workspace {
  display: grid;
  gap: 16px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ask-row {
  display: flex;
  gap: 8px;
}
.quick-asks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.rule-answer {
  margin-top: 14px;
}
.rule-answer pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.65;
  background: #f8fafc;
  border: 1px solid var(--line, #e5e7eb);
  border-radius: 8px;
  padding: 12px 14px;
}
.citations {
  margin-top: 10px;
  font-size: 13px;
}
.cite-title {
  color: var(--muted);
  margin-bottom: 4px;
}
.cite-item {
  padding: 2px 0;
}
.muted {
  color: var(--muted);
}
.stats {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
}
.stats div {
  background: #f7fafc;
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}
.stats b {
  display: block;
  font-size: 28px;
  color: var(--brand);
}
.stats span {
  color: var(--muted);
  font-size: 13px;
}
.flow-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.flow-card :deep(.el-step__title) {
  font-size: 12px;
  line-height: 1.3;
}
.flow-card :deep(.el-step__description) {
  font-size: 12px;
}
.stage-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0 8px;
}
.chip {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  padding: 8px 10px;
  min-width: 88px;
  cursor: pointer;
  text-align: left;
}
.chip b {
  display: block;
  color: var(--brand);
  font-size: 18px;
  line-height: 1.2;
}
.chip span {
  color: var(--muted);
  font-size: 12px;
}
.chip.active {
  border-color: var(--brand);
  background: #eff6ff;
}
.chip.muted {
  opacity: 0.55;
}
.flow-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  max-height: 320px;
  overflow: auto;
}
.flow-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  cursor: pointer;
}
.flow-item:hover {
  background: #eef2ff;
}
.flow-title {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
}
.flow-meta {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}
@media (max-width: 1200px) {
  .flow-grid {
    grid-template-columns: 1fr;
  }
  .stats {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 900px) {
  .ask-row {
    flex-direction: column;
  }
  .ask-row .el-button {
    width: 100%;
  }
  .stats {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .stats div {
    padding: 12px 8px;
  }
  .stats b {
    font-size: 22px;
  }
}
@media (max-width: 640px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .card-head {
    flex-wrap: wrap;
    gap: 8px;
  }
}
</style>
