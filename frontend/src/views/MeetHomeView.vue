<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> 会议现场 · 分轨办理</div>
      <h2>会议</h2>
      <p>党组织会议、党政联席会议与归档会议统一入口</p>
      <div class="nums">
        <div><strong>{{ partyList.length }}</strong><span>党组织会议</span></div>
        <div><strong>{{ jointList.length }}</strong><span>联席会议</span></div>
        <div><strong>{{ archivedList.length }}</strong><span>归档</span></div>
      </div>
    </div>

    <div class="ui-filter is-equal" role="tablist">
      <button
        type="button"
        role="tab"
        class="party"
        :aria-selected="activeTab === 'party'"
        :class="{ on: activeTab === 'party' }"
        @click="activeTab = 'party'"
      >
        党组织会议
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'joint'"
        :class="{ on: activeTab === 'joint' }"
        @click="activeTab = 'joint'"
      >
        党政联席会议
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'archived'"
        :class="{ on: activeTab === 'archived' }"
        @click="activeTab = 'archived'"
      >
        归档会议
      </button>
    </div>

    <div class="ui-sec">
      <h3>
        <i :class="{ party: activeTab === 'party' }"></i>
        {{ sectionTitle }}
      </h3>
      <div class="ui-sec-actions">
        <button
          v-if="activeTab === 'party' && roles.canCreateMeeting.value"
          class="ui-btn party"
          type="button"
          @click="openCreateParty"
        >
          创建会议
        </button>
        <button
          v-if="activeTab === 'joint' && roles.canCreateMeeting.value"
          class="ui-btn"
          type="button"
          @click="openCreateJoint"
        >
          创建会议
        </button>
        <button
          v-if="activeTab === 'archived'"
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
        v-if="activeTab === 'party' && roles.canCreateMeeting.value"
        style="margin-top: 10px"
      >
        <button class="ui-btn party" type="button" @click="openCreateParty">去创建会议</button>
      </div>
      <div
        v-if="activeTab === 'joint' && roles.canCreateMeeting.value"
        style="margin-top: 10px"
      >
        <button class="ui-btn" type="button" @click="openCreateJoint">去创建会议</button>
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
            :class="cardTrack(m)"
            type="button"
            style="width: 100%; text-align: left; cursor: pointer; font: inherit; color: inherit"
            @click="open(m)"
          >
            <div class="top">
              <span class="ui-tag" :class="cardTrack(m)">本月第 {{ m.monthIndex }} 次</span>
              <span v-if="activeTab === 'archived'" class="ui-tag" :class="cardTrack(m)">
                {{ typeLabel(m.meetingType) }}
              </span>
              <span class="ui-tag" :class="activeTab !== 'archived' ? cardTrack(m) : undefined">
                {{ statusLabel(m.status) }}
              </span>
              <span
                v-if="activeTab !== 'archived' && m.canResolve !== undefined"
                class="ui-tag"
                :class="m.canResolve ? 'ok' : 'warn'"
              >
                {{ m.canResolve ? '可决议' : '未达标' }}
              </span>
              <span v-if="m.isMajor" class="ui-tag warn">重大</span>
            </div>
            <h4>{{ m.title }}</h4>
            <div class="meta">
              <template v-if="activeTab === 'archived'">
                期次：{{ m.periodNo || '—' }} · 归档会议
              </template>
              <template v-else>
                期次：{{ m.periodNo || '—' }} · 时间：{{ formatTime(m.scheduledAt) }} · 议题
                {{ m.topics?.length || 0 }} · 到会 {{ m.actualAttend ?? 0 }}/{{
                  m.shouldAttend ?? 0
                }}
              </template>
            </div>
            <div class="foot">
              <span class="ui-link">进入详情</span>
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

type MeetTab = 'party' | 'joint' | 'archived'

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
const loading = ref(false)
const partyList = ref<MeetingItem[]>([])
const jointList = ref<MeetingItem[]>([])
const archivedList = ref<MeetingItem[]>([])

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

const sectionTitle = computed(() => {
  if (activeTab.value === 'party') return '党组织会议'
  if (activeTab.value === 'joint') return '党政联席会议'
  return '归档会议'
})

const emptyText = computed(() => {
  if (activeTab.value === 'party') return '暂无党组织会议'
  if (activeTab.value === 'joint') return '暂无党政联席会议'
  return '暂无归档会议'
})

const currentList = computed(() => {
  if (activeTab.value === 'party') return partyList.value
  if (activeTab.value === 'joint') return jointList.value
  return archivedList.value
})

const monthGroups = computed(() => groupMeetingsByMonth(currentList.value))

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

function typeLabel(meetingType?: string) {
  return meetingType === 'PARTY_COMMITTEE' ? '党组织会议' : '联席会'
}

function cardTrack(m: MeetingItem) {
  if (activeTab.value === 'archived') {
    return m.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint'
  }
  return activeTab.value === 'party' ? 'party' : 'joint'
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

function applyTabFromQuery() {
  const tab = String(route.query.tab || '')
  if (tab === 'party' || tab === 'joint' || tab === 'archived') {
    activeTab.value = tab
  }
}

function open(m: MeetingItem) {
  const from = m.meetingType === 'PARTY_COMMITTEE' ? 'party' : undefined
  router.push({
    name: 'meeting-detail',
    params: { id: m.id },
    query: from ? { from } : {},
  })
}

async function load() {
  loading.value = true
  try {
    const [party, joint, archived]: any[] = await Promise.all([
      http.get('/meetings', { params: { meetingType: 'PARTY_COMMITTEE' } }),
      http.get('/meetings', { params: { meetingType: 'JOINT_CONFERENCE' } }),
      http.get('/meetings', { params: { status: 'ARCHIVED' } }),
    ])
    partyList.value = (party || []).filter((m: MeetingItem) => m.status !== 'ARCHIVED')
    jointList.value = (joint || []).filter((m: MeetingItem) => m.status !== 'ARCHIVED')
    archivedList.value = archived || []
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
  activeTab.value = 'party'
  const college = roles.collegeName.value || '本院'
  form.title = `${college}党组织会议`
  form.periodNo = nextPeriodNo(partyList.value)
  form.scheduledAt = defaultScheduledAt()
  form.isMajor = false
  form.topicIds = []
  createVisible.value = true
  await loadCreateTopics('PARTY_COMMITTEE')
}

async function openCreateJoint() {
  createMode.value = 'joint'
  activeTab.value = 'joint'
  const college = roles.collegeName.value || '本院'
  form.title = `${college}党政联席会议`
  form.periodNo = nextPeriodNo(jointList.value)
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
  () => route.query.tab,
  () => applyTabFromQuery(),
)

onMounted(() => {
  applyTabFromQuery()
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
