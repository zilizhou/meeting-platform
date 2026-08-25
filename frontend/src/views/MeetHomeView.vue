<template>
  <div>
    <div class="ui-hero is-official" :class="{ party: activeTab === 'party' }">
      <div class="eyebrow"><b></b> 会议现场 · 分轨办理</div>
      <h2>会议</h2>
      <p>
        当前：{{ activeTab === 'party' ? '党组织会议' : '党政联席会议' }} · 按状态查阅本轨会议
      </p>
      <div class="nums">
        <button
          type="button"
          class="num"
          :class="[
            activeTab === 'party' ? 'party' : 'joint',
            { on: statusFilter === 'active' },
          ]"
          @click="setStatus('active')"
        >
          <strong>{{ currentActiveCount }}</strong><span>进行中</span>
        </button>
        <button
          type="button"
          class="num all"
          :class="{ on: statusFilter === 'archived' }"
          @click="setStatus('archived')"
        >
          <strong>{{ currentArchivedCount }}</strong><span>已归档</span>
        </button>
      </div>
    </div>

    <div class="ui-filter is-equal" role="tablist">
      <button
        type="button"
        role="tab"
        class="party"
        :aria-selected="activeTab === 'party'"
        :class="{ on: activeTab === 'party' }"
        @click="setTab('party')"
      >
        党组织会议
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'joint'"
        :class="{ on: activeTab === 'joint' }"
        @click="setTab('joint')"
      >
        党政联席会议
      </button>
    </div>

    <div class="ui-sec ui-sec--actions-only">
      <div class="ui-sec-actions">
        <button
          v-if="statusFilter === 'active' && activeTab === 'party' && roles.canCreateMeeting.value"
          class="ui-btn party"
          type="button"
          @click="openCreateParty"
        >
          创建会议
        </button>
        <button
          v-if="activeTab === 'party' && roles.canCreateMeeting.value"
          class="ui-btn light"
          type="button"
          @click="router.push({ path: '/meeting-import', query: { type: 'party' } })"
        >
          历史会议导入
        </button>
        <button
          v-if="statusFilter === 'active' && activeTab === 'joint' && roles.canCreateMeeting.value"
          class="ui-btn"
          type="button"
          @click="openCreateJoint"
        >
          创建会议
        </button>
        <button
          v-if="activeTab === 'joint' && roles.canCreateMeeting.value"
          class="ui-btn light"
          type="button"
          @click="router.push({ path: '/meeting-import', query: { type: 'joint' } })"
        >
          历史会议导入
        </button>
        <button
          v-if="statusFilter === 'archived'"
          class="ui-btn light"
          type="button"
          @click="router.push('/archives')"
        >
          档案中心
        </button>
        <button class="ui-link" type="button" @click="load">刷新</button>
        <span class="n">{{ currentList.length }} 场 · {{ monthGroups.length }} 个月</span>
      </div>
    </div>

    <div v-if="loading" class="ui-empty">加载中…</div>
    <div v-else-if="!currentList.length" class="ui-empty">
      {{ emptyText }}
      <div
        v-if="statusFilter === 'active' && activeTab === 'party' && roles.canCreateMeeting.value"
        style="margin-top: 10px"
      >
        <button class="ui-btn party" type="button" @click="openCreateParty">去创建会议</button>
      </div>
      <div
        v-if="statusFilter === 'active' && activeTab === 'joint' && roles.canCreateMeeting.value"
        style="margin-top: 10px"
      >
        <button class="ui-btn" type="button" @click="openCreateJoint">去创建会议</button>
      </div>
      <div
        v-if="statusFilter === 'archived' && roles.canCreateMeeting.value"
        style="margin-top: 10px"
      >
        <button
          class="ui-btn"
          :class="{ party: activeTab === 'party' }"
          type="button"
          @click="
            router.push({
              path: '/meeting-import',
              query: { type: activeTab === 'party' ? 'party' : 'joint' },
            })
          "
        >
          历史会议导入
        </button>
      </div>
    </div>

    <div v-else class="meet-month-list">
      <section v-for="g in monthGroups" :key="g.key" class="meet-month">
        <div class="meet-month-head">
          <strong>{{ g.label }}</strong>
          <span>召开 {{ g.count }} 次</span>
        </div>
        <div class="meet-grid">
          <button
            v-for="m in g.meetings"
            :key="m.id"
            class="ui-card"
            :class="cardTrack"
            type="button"
            style="width: 100%; text-align: left; cursor: pointer; font: inherit; color: inherit"
            @click="open(m)"
          >
            <div class="top">
              <span class="ui-tag" :class="cardTrack">本月第 {{ m.monthIndex }} 次</span>
              <span class="ui-tag" :class="cardTrack">{{ statusLabel(m.status) }}</span>
              <span
                v-if="statusFilter === 'active' && m.canResolve !== undefined"
                class="ui-tag"
                :class="m.canResolve ? 'ok' : 'warn'"
              >
                {{ m.canResolve ? '可决议' : '未达标' }}
              </span>
              <span v-if="m.isMajor" class="ui-tag warn">重大</span>
            </div>
            <h4>{{ m.title }}</h4>
            <div class="meta">
              <template v-if="statusFilter === 'archived'">
                期次：{{ m.periodNo || '—' }} · 时间：{{ formatTime(m.scheduledAt) }} · 已归档
              </template>
              <template v-else>
                期次：{{ m.periodNo || '—' }} · 时间：{{ formatTime(m.scheduledAt) }} ·
                {{ flowResumeText(m) }} · 议题 {{ m.topics?.length || 0 }} · 到会
                {{ m.actualAttend ?? 0 }}/{{ m.shouldAttend ?? 0 }}
              </template>
            </div>
            <div class="foot">
              <span class="ui-link">{{ flowResumeLink(m) }}</span>
              <span>›</span>
            </div>
          </button>
        </div>
      </section>
    </div>

    <el-dialog
      v-model="createVisible"
      :title="createMode === 'party' ? '创建学院党组织会议' : '创建党政联席会议'"
      width="720px"
      align-center
      destroy-on-close
    >
      <div class="create-block">
        <div class="create-label">会议信息</div>
        <div class="create-grid">
          <label class="field full">
            <span>会议名称</span>
            <el-input v-model="form.title" placeholder="请输入会议名称" />
          </label>
          <label class="field">
            <span>期次</span>
            <el-input v-model="form.periodNo" placeholder="如 2026-03" />
          </label>
          <label class="field">
            <span>会议时间</span>
            <el-date-picker
              v-model="form.scheduledAt"
              type="datetime"
              style="width: 100%"
              placeholder="选择会议时间"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DDTHH:mm:ss"
            />
          </label>
          <label class="field">
            <span>重大事项会</span>
            <div class="major-row">
              <el-switch v-model="form.isMajor" />
              <em>开启后法定人数按 2/3</em>
            </div>
          </label>
        </div>
      </div>

      <div class="create-block create-block--topics">
        <div class="create-label">
          入会议题
          <span class="create-count">
            必选 · 可选 {{ availableTopics.length }} · 已选 {{ form.topicIds.length }}
          </span>
        </div>
        <p class="create-hint">
          至少勾选 1 项议题方可创建（{{
            createMode === 'party' ? '未审题勾选后视为通过' : '未双审勾选后视为通过'
          }}）。已入其他会议的议题不可再选。
          <template v-if="createMode === 'party'">
            党组织会议须纳入「第一议题（政治理论学习）」，否则不能开会。
          </template>
        </p>

        <div class="topic-table" :class="{ party: createMode === 'party' }">
          <div class="topic-table-head">
            <span class="col-check" aria-hidden="true"></span>
            <span class="col-title">议题标题</span>
            <span class="col-user">提交人</span>
            <span class="col-time">提交时间</span>
          </div>

          <div v-if="topicsLoading" class="topic-table-empty">加载议题中…</div>

          <template v-else-if="pickerTopics.length">
            <el-checkbox-group v-model="form.topicIds" class="topic-table-body">
              <div
                v-for="t in pickerTopics"
                :key="t.id"
                class="topic-table-row"
                :class="{ disabled: t.locked, selected: form.topicIds.includes(t.id) }"
                role="button"
                tabindex="0"
                @click="toggleTopic(t)"
                @keydown.enter.prevent="toggleTopic(t)"
                @keydown.space.prevent="toggleTopic(t)"
              >
                <span class="col-check" @click.stop>
                  <el-checkbox :value="t.id" :disabled="t.locked" />
                </span>
                <span class="col-title">
                  <em>{{ t.title }}</em>
                  <small v-if="t.category?.code === 'FIRST_TOPIC'">第一议题</small>
                  <small v-if="t.locked">已入会 · {{ t.meeting?.title || '其他会议' }}</small>
                  <small v-else-if="t.status !== 'APPROVED'">未审 · 选中即通过</small>
                </span>
                <span class="col-user">{{ t.proposer?.realName || '—' }}</span>
                <span class="col-time">{{ formatShortTime(t.createdAt) }}</span>
              </div>
            </el-checkbox-group>
          </template>

          <div v-else class="topic-table-empty">
            暂无议题。
            <button class="ui-link" type="button" @click="goTopicCreate">去征集议题</button>
          </div>
        </div>
      </div>

      <template #footer>
        <button class="ui-btn light" type="button" @click="createVisible = false">取消</button>
        <button
          class="ui-btn"
          :class="{ party: createMode === 'party' }"
          type="button"
          :disabled="creating || !form.topicIds.length"
          @click="submitCreate"
        >
          {{ creating ? '创建中…' : '创建会议' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'
import { groupMeetingsByMonth } from '@/utils/meetingMonthGroups'
import { deriveMeetingFlowStep, meetingFlowResumeText } from '@/utils/meetingFlow'

type MeetTab = 'party' | 'joint'
type StatusFilter = 'active' | 'archived'

interface MeetingItem {
  id: string
  title: string
  status: string
  meetingType?: string
  periodNo?: string
  scheduledAt?: string
  createdAt?: string
  location?: string
  isMajor?: boolean
  canResolve?: boolean
  actualAttend?: number
  shouldAttend?: number
  topics?: { id: string }[]
}

const router = useRouter()
const route = useRoute()
const roles = useRoles()
const activeTab = ref<MeetTab>('party')
const statusFilter = ref<StatusFilter>('active')
const loading = ref(false)
const partyAll = ref<MeetingItem[]>([])
const jointAll = ref<MeetingItem[]>([])

const createVisible = ref(false)
const createMode = ref<'party' | 'joint'>('party')
const topicsLoading = ref(false)
const creating = ref(false)
const topics = ref<any[]>([])
const form = reactive({
  title: '',
  periodNo: '',
  scheduledAt: '',
  isMajor: false,
  topicIds: [] as string[],
})

const STATUS: Record<string, string> = {
  DRAFT: '草稿',
  SCHEDULED: '已排期',
  IN_PROGRESS: '进行中',
  ENDED: '已结束',
  RESOLVED: '已决议',
  ARCHIVED: '已归档',
}

const partyActiveList = computed(() =>
  partyAll.value.filter((m) => m.status !== 'ARCHIVED'),
)
const partyArchivedList = computed(() =>
  partyAll.value.filter((m) => m.status === 'ARCHIVED'),
)
const jointActiveList = computed(() =>
  jointAll.value.filter((m) => m.status !== 'ARCHIVED'),
)
const jointArchivedList = computed(() =>
  jointAll.value.filter((m) => m.status === 'ARCHIVED'),
)

const currentActiveCount = computed(() =>
  activeTab.value === 'party' ? partyActiveList.value.length : jointActiveList.value.length,
)
const currentArchivedCount = computed(() =>
  activeTab.value === 'party'
    ? partyArchivedList.value.length
    : jointArchivedList.value.length,
)

const emptyText = computed(() => {
  if (statusFilter.value === 'archived') {
    return activeTab.value === 'party'
      ? '暂无党组织归档会议'
      : '暂无党政联席归档会议'
  }
  return activeTab.value === 'party' ? '暂无党组织会议' : '暂无党政联席会议'
})

const currentList = computed(() => {
  if (activeTab.value === 'party') {
    return statusFilter.value === 'archived' ? partyArchivedList.value : partyActiveList.value
  }
  return statusFilter.value === 'archived' ? jointArchivedList.value : jointActiveList.value
})

const monthGroups = computed(() => groupMeetingsByMonth(currentList.value))

const cardTrack = computed(() => (activeTab.value === 'party' ? 'party' : 'joint'))

function isTopicLocked(t: any) {
  return (
    !!t.meetingId ||
    t.status === 'REJECTED' ||
    t.status === 'RESOLVED' ||
    t.status === 'ON_AGENDA'
  )
}

const availableTopics = computed(() => topics.value.filter((t) => !isTopicLocked(t)))

const pickerTopics = computed(() =>
  topics.value
    .filter((t) => t.status !== 'REJECTED')
    .map((t) => ({ ...t, locked: isTopicLocked(t) }))
    .sort((a, b) => Number(a.locked) - Number(b.locked)),
)

function statusLabel(s: string) {
  return STATUS[s] || s
}

function formatTime(v?: string) {
  if (!v) return '时间待定'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatShortTime(v?: string) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function syncQuery() {
  const query: Record<string, string> = { tab: activeTab.value }
  if (statusFilter.value === 'archived') query.status = 'archived'
  const curTab = String(route.query.tab || 'party')
  const curStatus = String(route.query.status || '')
  const nextStatus = query.status || ''
  if (curTab === query.tab && curStatus === nextStatus) return
  router.replace({ query })
}

function applyFromQuery() {
  const tab = String(route.query.tab || '')
  // 兼容旧链接：/meet?tab=archived → 党组织 · 已归档
  if (tab === 'archived') {
    activeTab.value = 'party'
    statusFilter.value = 'archived'
    syncQuery()
    return
  }
  if (tab === 'party' || tab === 'joint') activeTab.value = tab
  statusFilter.value = String(route.query.status || '') === 'archived' ? 'archived' : 'active'
}

function setTab(tab: MeetTab) {
  activeTab.value = tab
  syncQuery()
}

function setStatus(status: StatusFilter) {
  statusFilter.value = status
  syncQuery()
}

function open(m: MeetingItem) {
  const from = m.meetingType === 'PARTY_COMMITTEE' ? 'party' : undefined
  const flow = deriveMeetingFlowStep(m as any)
  const query: Record<string, string> = {}
  if (from) query.from = from
  if (!flow.allDone) query.step = String(flow.index + 1)
  router.push({
    name: 'meeting-detail',
    params: { id: m.id },
    query,
  })
}

function flowResumeText(m: MeetingItem) {
  return meetingFlowResumeText(m as any)
}

function flowResumeLink(m: MeetingItem) {
  const flow = deriveMeetingFlowStep(m as any)
  if (flow.allDone) return '查看详情'
  return `续办 · ${flow.label}`
}

async function load() {
  loading.value = true
  try {
    const [party, joint]: any[] = await Promise.all([
      http.get('/meetings', { params: { meetingType: 'PARTY_COMMITTEE' } }),
      http.get('/meetings', { params: { meetingType: 'JOINT_CONFERENCE' } }),
    ])
    partyAll.value = party || []
    jointAll.value = joint || []
  } finally {
    loading.value = false
  }
}

function nextPeriodNo(list: MeetingItem[]) {
  const year = new Date().getFullYear()
  const countThisYear = list.filter((m) => {
    const raw = m.scheduledAt || m.createdAt
    if (!raw) return false
    const d = new Date(raw)
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year
  }).length
  return `${year}-${String(countThisYear + 1).padStart(2, '0')}`
}

function defaultScheduledAt() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(14, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

async function loadCreateTopics(meetingType: 'PARTY_COMMITTEE' | 'JOINT_CONFERENCE') {
  topicsLoading.value = true
  try {
    topics.value = await http.get('/topics', { params: { meetingType } })
  } finally {
    topicsLoading.value = false
  }
}

async function openCreateParty() {
  createMode.value = 'party'
  setTab('party')
  setStatus('active')
  const college = roles.collegeName.value || '本院'
  form.title = `${college}党组织会议`
  form.periodNo = nextPeriodNo(partyAll.value)
  form.scheduledAt = defaultScheduledAt()
  form.isMajor = false
  form.topicIds = []
  createVisible.value = true
  await loadCreateTopics('PARTY_COMMITTEE')
}

async function openCreateJoint() {
  createMode.value = 'joint'
  setTab('joint')
  setStatus('active')
  const college = roles.collegeName.value || '本院'
  form.title = `${college}党政联席会议`
  form.periodNo = nextPeriodNo(jointAll.value)
  form.scheduledAt = defaultScheduledAt()
  form.isMajor = false
  form.topicIds = []
  createVisible.value = true
  await loadCreateTopics('JOINT_CONFERENCE')
}

function toggleTopic(t: { id: string; locked?: boolean }) {
  if (t.locked) return
  const i = form.topicIds.indexOf(t.id)
  if (i >= 0) form.topicIds.splice(i, 1)
  else form.topicIds.push(t.id)
}

function goTopicCreate() {
  createVisible.value = false
  router.push({
    name: 'topic-create',
    query: {
      meetingType:
        createMode.value === 'party' ? 'PARTY_COMMITTEE' : 'JOINT_CONFERENCE',
    },
  })
}

async function submitCreate() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写会议名称')
    return
  }
  if (!form.topicIds.length) {
    ElMessage.warning('请至少选择一项入会议题')
    return
  }
  const meetingType =
    createMode.value === 'party' ? 'PARTY_COMMITTEE' : 'JOINT_CONFERENCE'
  if (meetingType === 'PARTY_COMMITTEE') {
    const selected = topics.value.filter((t) => form.topicIds.includes(t.id))
    const hasFirst = selected.some((t) => t.category?.code === 'FIRST_TOPIC')
    if (!hasFirst) {
      ElMessage.warning('党组织会议须纳入「第一议题（政治理论学习）」后方可开会')
      return
    }
  }
  creating.value = true
  try {
    await http.post('/meetings', { ...form, meetingType })
    ElMessage.success(
      `${createMode.value === 'party' ? '党组织' : '联席'}会议已创建，已入会 ${form.topicIds.length} 项议题`,
    )
    createVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    creating.value = false
  }
}

watch(
  () => [route.query.tab, route.query.status],
  () => applyFromQuery(),
)

onMounted(() => {
  applyFromQuery()
  load()
})
</script>

<style scoped>
.ui-sec h3 i.party {
  background: var(--party);
}

.ui-tag.ok {
  background: #e6f4ec;
  color: var(--ok);
}

.meet-month-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.meet-month-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  padding: 0 2px;
}
.meet-month-head strong {
  font-size: 15px;
  font-weight: 700;
  font-family: var(--font-serif);
  color: var(--text);
}
.meet-month-head span {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.create-block {
  margin-bottom: 18px;
}
.create-block--topics {
  margin-bottom: 4px;
}
.create-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-serif);
  color: var(--text);
}
.create-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.create-hint {
  margin: -2px 0 10px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}
.create-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.field.full {
  grid-column: 1 / -1;
}
.field > span {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.major-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
}
.major-row em {
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
}

.topic-table {
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.topic-table-head,
.topic-table-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1.6fr) 88px 96px;
  gap: 8px;
  align-items: center;
  padding: 0 12px;
}
.topic-table-head {
  height: 36px;
  background: #f5f7fa;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}
.topic-table-body {
  display: block;
  max-height: 280px;
  overflow-y: auto;
  width: 100%;
}
.topic-table-row {
  min-height: 52px;
  padding-top: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eef1f5;
  cursor: pointer;
  margin: 0;
}
.topic-table-row:last-child {
  border-bottom: none;
}
.topic-table-row:hover:not(.disabled) {
  background: #f3f6fa;
}
.topic-table-row.selected {
  background: var(--joint-soft);
}
.topic-table.party .topic-table-row.selected {
  background: var(--party-soft);
}
.topic-table.party .topic-table-row:not(.disabled) .col-title small {
  color: var(--party);
}
.topic-table-row.disabled {
  cursor: default;
  opacity: 0.72;
  background: #f8f9fb;
}
.col-check {
  display: grid;
  place-items: center;
}
.col-check :deep(.el-checkbox) {
  height: auto;
  margin: 0;
}
.col-check :deep(.el-checkbox__label) {
  display: none;
}
.col-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.col-title em {
  font-style: normal;
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-serif);
  color: var(--text);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-title small {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.3;
}
.topic-table-row:not(.disabled) .col-title small {
  color: var(--joint);
}
.col-user,
.col-time {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topic-table-empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

@media (max-width: 640px) {
  .create-grid {
    grid-template-columns: 1fr;
  }
  .topic-table-head {
    display: none;
  }
  .topic-table-row {
    grid-template-columns: 28px 1fr;
    gap: 2px 8px;
  }
  .col-check {
    grid-row: 1 / span 2;
  }
  .col-title em {
    white-space: normal;
  }
  .col-user,
  .col-time {
    grid-column: 2;
    display: inline;
  }
  .col-user::after {
    content: ' · ';
  }
}
</style>
