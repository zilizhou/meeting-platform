<template>
  <div class="todo-page">
    <div class="ui-hero is-official todo-hero">
      <div class="todo-hero-text">
        <h2>待办</h2>
        <p>审题、纪要、督办与校级反馈</p>
      </div>
      <div class="nums">
        <button
          type="button"
          class="num kpi gold"
          :class="{ on: kind === 'all' }"
          @click="kind = 'all'"
        >
          <strong>{{ counts.all }}</strong>
          <span>全部</span>
        </button>
        <button
          type="button"
          class="num kpi coral"
          :class="{ on: kind === 'review' }"
          @click="kind = 'review'"
        >
          <strong>{{ counts.review }}</strong>
          <span>待审题</span>
        </button>
        <button
          type="button"
          class="num kpi sky"
          :class="{ on: kind === 'minutes' }"
          @click="kind = 'minutes'"
        >
          <strong>{{ counts.minutes }}</strong>
          <span>纪要</span>
        </button>
        <button
          type="button"
          class="num kpi mint"
          :class="{ on: kind === 'supervision' }"
          @click="kind = 'supervision'"
        >
          <strong>{{ counts.supervision }}</strong>
          <span>督办</span>
        </button>
        <button
          v-if="canCollegeFeedback"
          type="button"
          class="num kpi plum"
          :class="{ on: kind === 'feedback' }"
          @click="focusFeedback"
        >
          <strong>{{ feedbackItems.length }}</strong>
          <span>反馈</span>
        </button>
      </div>
    </div>

    <div
      v-if="holding && (!holding.party?.held || !holding.joint?.held)"
      class="rule-banner warn"
    >
      <strong>{{ holding.label }}召开进度未达标</strong>
      党委会 {{ holding.party?.count }}/{{ holding.party?.required }}
      · 党政联席会议 {{ holding.joint?.count }}/{{ holding.joint?.required }}。
    </div>

    <section v-if="canCollegeFeedback" ref="feedbackSec" class="feedback-block">
      <div class="ui-sec">
        <h3><i class="party"></i>校级反馈</h3>
        <span class="n">{{ feedbackItems.length }} 条</span>
      </div>
      <p class="group-hint">校级对本院的意见往来，可在此直接查看并回复。</p>
      <div v-if="feedbackLoading" class="ui-empty">加载反馈…</div>
      <div v-else-if="!feedbackItems.length" class="ui-empty soft">暂无校级反馈</div>
      <div v-else class="fb-list">
        <button
          v-for="t in feedbackItems"
          :key="t.id"
          type="button"
          class="fb-card"
          @click="openFeedback(t)"
        >
          <div class="fb-top">
            <strong>{{ t.subject || '校级反馈' }}</strong>
            <span>{{ formatTime(t.lastMessageAt) }}</span>
          </div>
          <em>{{ preview(t.lastMessage?.content) }}</em>
          <span class="fb-count">{{ t.messageCount }} 条消息 · 点开回复</span>
        </button>
      </div>
    </section>

    <div class="ui-filter is-equal" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="track === 'all'"
        :class="{ on: track === 'all' }"
        @click="track = 'all'"
      >
        全部会议
      </button>
      <button
        type="button"
        role="tab"
        class="party"
        :aria-selected="track === 'party'"
        :class="{ on: track === 'party' }"
        @click="track = 'party'"
      >
        党委会
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="track === 'joint'"
        :class="{ on: track === 'joint' }"
        @click="track = 'joint'"
      >
        党政联席
      </button>
    </div>

    <div v-if="loading" class="ui-empty">加载中…</div>
    <template v-else>
      <section
        v-for="group in visibleGroups"
        :key="group.key"
        class="todo-group"
      >
        <div class="ui-sec">
          <h3>
            <i :class="{ party: group.key === 'review' || group.key === 'supervision' }"></i>
            {{ group.title }}
          </h3>
          <span class="n">{{ group.items.length }} 项</span>
        </div>
        <p class="group-hint">{{ group.hint }}</p>
        <div v-if="!group.items.length" class="ui-empty">{{ emptyText }}</div>
        <div v-else class="todo-grid">
          <article
            v-for="item in group.items"
            :key="item.id"
            class="ui-card"
            :class="trackOf(item)"
          >
            <div class="top">
              <span class="ui-tag" :class="trackOf(item)">{{ typeLabel(item.type) }}</span>
              <span
                class="ui-tag"
                :class="{ warn: isOverdue(item), [trackOf(item)]: !isOverdue(item) }"
              >
                {{ trackLabel(item) }}
              </span>
            </div>
            <h4>{{ displayTitle(item) }}</h4>
            <div class="meta">{{ item.subtitle || '点击办理' }}</div>
            <div class="foot">
              <button class="ui-link" type="button" @click="go(item)">详情</button>
              <button
                class="ui-btn"
                :class="trackOf(item)"
                type="button"
                @click="go(item)"
              >
                {{ actionLabel(item.type) }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <div v-if="!visibleGroups.length && kind !== 'feedback'" class="ui-empty">
        {{ emptyText }}
        <button class="ui-btn" type="button" style="margin-top: 12px" @click="router.push('/topics-home')">
          打开议题
        </button>
      </div>
    </template>

    <SchoolFeedbackPanel
      v-if="canCollegeFeedback"
      :open="panelOpen"
      :college-id="panelCollegeId"
      :college-name="panelCollegeName"
      :can-create="false"
      :initial-thread-id="panelThreadId"
      @close="closeFeedback"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'
import SchoolFeedbackPanel from '@/components/SchoolFeedbackPanel.vue'

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

interface FeedbackThread {
  id: string
  collegeId: string
  subject?: string | null
  lastMessageAt: string
  messageCount: number
  college?: { name: string }
  lastMessage?: { content: string } | null
}

type KindFilter = 'all' | 'review' | 'minutes' | 'supervision' | 'feedback'
type TrackFilter = 'all' | 'party' | 'joint'

interface TodoGroup {
  key: Exclude<KindFilter, 'all' | 'feedback'>
  title: string
  hint: string
  items: TodoItem[]
}

const router = useRouter()
const { canCollegeFeedback, auth } = useRoles()
const loading = ref(true)
const kind = ref<KindFilter>('all')
const track = ref<TrackFilter>('all')
const items = ref<TodoItem[]>([])
const holding = ref<any>(null)

const feedbackLoading = ref(false)
const feedbackItems = ref<FeedbackThread[]>([])
const feedbackSec = ref<HTMLElement | null>(null)
const panelOpen = ref(false)
const panelCollegeId = ref('')
const panelCollegeName = ref('')
const panelThreadId = ref('')

const TYPE_LABEL: Record<string, string> = {
  JOINT_REVIEW: '联席审题',
  PARTY_REVIEW: '党委会审题',
  MINUTES: '整理纪要',
  MINUTES_SIGN: '整理纪要',
  SUPERVISION: '督办',
}

const ACTION_LABEL: Record<string, string> = {
  JOINT_REVIEW: '去审题',
  PARTY_REVIEW: '去审题',
  MINUTES: '去整理',
  MINUTES_SIGN: '去整理',
  SUPERVISION: '去反馈',
}

const GROUPS: { key: Exclude<KindFilter, 'all' | 'feedback'>; title: string; hint: string }[] = [
  {
    key: 'review',
    title: '待审题',
    hint: '核对材料后给出同意或暂缓。学院管理员可直接审题。',
  },
  {
    key: 'minutes',
    title: '待整理纪要',
    hint: '会后上传或编辑纪要正文，不替代现场签署。',
  },
  {
    key: 'supervision',
    title: '督办落实',
    hint: '按决议反馈进展；逾期项请优先办理。',
  },
]

function typeLabel(t: string) {
  return TYPE_LABEL[t] || t
}

function actionLabel(t: string) {
  return ACTION_LABEL[t] || '办理'
}

function kindOf(item: TodoItem): Exclude<KindFilter, 'all' | 'feedback'> | null {
  if (item.type === 'JOINT_REVIEW' || item.type === 'PARTY_REVIEW') return 'review'
  if (item.type === 'MINUTES' || item.type === 'MINUTES_SIGN') return 'minutes'
  if (item.type === 'SUPERVISION') return 'supervision'
  return null
}

function trackOf(item: TodoItem) {
  if (item.meetingType === 'PARTY_COMMITTEE' || item.type === 'PARTY_REVIEW') return 'party'
  if (item.meetingType === 'JOINT_CONFERENCE' || item.type === 'JOINT_REVIEW') return 'joint'
  if (item.type === 'SUPERVISION') return 'party'
  return 'joint'
}

function trackLabel(item: TodoItem) {
  if (item.meetingType === 'PARTY_COMMITTEE') return '党委会'
  if (item.meetingType === 'JOINT_CONFERENCE') return '党政联席'
  return '综合'
}

function displayTitle(item: TodoItem) {
  return item.title.replace(
    /^(联席会议题待审|党委会议题待审|督办待办|待整理纪要)[：:]\s*/,
    '',
  )
}

function isOverdue(item: TodoItem) {
  return item.type === 'SUPERVISION' && /逾期/.test(`${item.subtitle || ''}${item.title || ''}`)
}

const trackedItems = computed(() =>
  items.value.filter((i) => {
    if (!kindOf(i)) return false
    if (track.value === 'all') return true
    return track.value === 'party' ? trackOf(i) === 'party' : trackOf(i) === 'joint'
  }),
)

const counts = computed(() => {
  const list = trackedItems.value
  return {
    all: list.length,
    review: list.filter((i) => kindOf(i) === 'review').length,
    minutes: list.filter((i) => kindOf(i) === 'minutes').length,
    supervision: list.filter((i) => kindOf(i) === 'supervision').length,
  }
})

const visibleGroups = computed<TodoGroup[]>(() => {
  if (kind.value === 'feedback') return []
  return GROUPS.map((g) => ({
    ...g,
    items: trackedItems.value.filter((i) => kindOf(i) === g.key),
  })).filter((g) => (kind.value === 'all' ? g.items.length > 0 : g.key === kind.value))
})

const emptyText = computed(() => {
  if (kind.value === 'review') return '当前没有待审议题'
  if (kind.value === 'minutes') return '当前没有待整理纪要'
  if (kind.value === 'supervision') return '当前没有督办事项'
  return '暂无待办，可到议题申报或查看议题库'
})

async function loadFeedback() {
  if (!canCollegeFeedback.value) return
  feedbackLoading.value = true
  try {
    const res: any = await http.get('/feedback')
    feedbackItems.value = res.items || []
  } catch {
    feedbackItems.value = []
  } finally {
    feedbackLoading.value = false
  }
}

async function load() {
  loading.value = true
  try {
    const data: any = await http.get('/workspace/todos')
    items.value = data.items || []
    try {
      holding.value = await http.get('/meetings/holding')
    } catch {
      holding.value = null
    }
    await loadFeedback()
  } finally {
    loading.value = false
  }
}

async function focusFeedback() {
  kind.value = 'feedback'
  await nextTick()
  feedbackSec.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function openFeedback(t: FeedbackThread) {
  panelCollegeId.value = t.collegeId
  panelCollegeName.value = t.college?.name || auth.user?.collegeName || ''
  panelThreadId.value = t.id
  panelOpen.value = true
}

function closeFeedback() {
  panelOpen.value = false
  panelThreadId.value = ''
  loadFeedback()
}

function preview(text?: string) {
  if (!text) return '暂无内容'
  return text.length > 72 ? `${text.slice(0, 72)}…` : text
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function go(item: TodoItem) {
  if (item.meetingId && (item.type === 'MINUTES' || item.type === 'MINUTES_SIGN')) {
    router.push({
      name: 'meeting-detail',
      params: { id: item.meetingId },
      query: { from: item.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint' },
    })
    return
  }
  if (item.topicId) {
    router.push({
      name: 'topic-detail',
      params: { id: item.topicId },
      query: { from: item.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint' },
    })
    return
  }
  if (item.meetingId) {
    router.push({
      name: 'meeting-detail',
      params: { id: item.meetingId },
      query: { from: item.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint' },
    })
    return
  }
  if (item.taskId || item.type === 'SUPERVISION') {
    router.push('/supervisions')
    return
  }
  router.push('/topics-home')
}

onMounted(load)
</script>

<style scoped>
.todo-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.todo-hero-text {
  min-width: 0;
  flex: 1 1 140px;
}

.todo-hero :deep(h2) {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.todo-hero :deep(p) {
  margin: 3px 0 0;
  font-size: 12px;
  opacity: 0.8;
  line-height: 1.35;
}

.todo-hero :deep(.nums) {
  margin-top: 0;
  flex: 1 1 auto;
  justify-content: flex-end;
}

@media (min-width: 1024px) {
  .todo-hero {
    padding: 14px 18px;
  }
  .todo-hero :deep(h2) {
    font-size: 22px;
  }
  .todo-hero :deep(p) {
    font-size: 13px;
  }
}

.rule-banner {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f0fdf4;
  border: 1px solid #86efac;
  font-size: 13px;
  line-height: 1.55;
}
.rule-banner.warn {
  background: #fff7ed;
  border-color: #fdba74;
}
.rule-banner strong {
  display: block;
  margin-bottom: 2px;
}

.feedback-block {
  margin-bottom: 16px;
}

.fb-list {
  display: grid;
  gap: 8px;
}

.fb-card {
  display: block;
  width: 100%;
  text-align: left;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 14px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  box-shadow: var(--shadow);
}

.fb-card:hover {
  border-color: #c5d6ea;
}

.fb-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.fb-top strong {
  font-size: 14px;
}

.fb-top span {
  color: var(--muted);
  font-size: 12px;
  flex-shrink: 0;
}

.fb-card em {
  display: block;
  font-style: normal;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text);
  margin-bottom: 6px;
}

.fb-count {
  color: var(--joint);
  font-size: 12px;
  font-weight: 600;
}

.ui-empty.soft {
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px dashed var(--line);
}

.todo-group {
  margin-bottom: 22px;
}
.group-hint {
  margin: -4px 0 12px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}
</style>
