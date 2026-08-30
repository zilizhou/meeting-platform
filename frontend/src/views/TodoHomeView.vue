<template>
  <div class="todo-page">
    <div class="ui-hero is-official todo-hero">
      <div class="todo-hero-row">
        <div class="todo-hero-text">
          <h2>待办</h2>
          <p>审题 · 纪要 · 督办 · 反馈</p>
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
            :class="{ on: feedbackSheetOpen }"
            @click="focusFeedback"
          >
            <strong>{{ feedbackMessages.length }}</strong>
            <span>反馈</span>
          </button>
        </div>
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

    <button
      v-if="canCollegeFeedback"
      type="button"
      class="feedback-entry"
      @click="openFeedbackSheet"
    >
      <div class="fb-entry-copy">
        <strong>校级反馈</strong>
        <em>{{ feedbackMessages.length ? `${feedbackMessages.length} 条消息，点开查看并回复` : '暂无消息，点开也可刷新' }}</em>
      </div>
      <span class="chev" aria-hidden="true"><el-icon><CaretRight /></el-icon></span>
    </button>

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

    <el-drawer
      v-if="canCollegeFeedback"
      v-model="feedbackSheetOpen"
      title="校级反馈"
      direction="btt"
      size="78%"
      class="feedback-drawer"
      append-to-body
    >
      <p class="drawer-hint">以下为全部往来消息，点「回复」即可直接发送。</p>
      <div v-if="feedbackLoading" class="ui-empty">加载反馈…</div>
      <div v-else-if="!feedbackMessages.length" class="ui-empty soft">暂无校级反馈</div>
      <div v-else class="fb-msg-list">
        <article
          v-for="m in feedbackMessages"
          :key="m.id"
          class="fb-msg"
          :class="m.fromSchool ? 'school' : 'college'"
        >
          <header>
            <div>
              <b>{{ m.author.realName }}</b>
              <span>{{ m.fromSchool ? '校级' : '本院' }}</span>
            </div>
            <time>{{ formatTime(m.createdAt) }}</time>
          </header>
          <p class="fb-subject" v-if="m.subject">{{ m.subject }}</p>
          <p class="fb-body">{{ m.content }}</p>
          <button type="button" class="fb-reply-btn" @click="openReply(m)">回复</button>
        </article>
      </div>
    </el-drawer>

    <el-dialog
      v-if="canCollegeFeedback"
      v-model="replyOpen"
      title="回复校级反馈"
      width="92%"
      align-center
      append-to-body
      destroy-on-close
    >
      <div v-if="replyTarget" class="reply-quote">
        <strong>{{ replyTarget.fromSchool ? '校级' : '本院' }} · {{ replyTarget.author.realName }}</strong>
        <p>{{ replyTarget.content }}</p>
      </div>
      <el-input
        v-model="replyDraft"
        type="textarea"
        :rows="4"
        maxlength="2000"
        show-word-limit
        placeholder="输入回复内容…"
      />
      <template #footer>
        <el-button @click="replyOpen = false">取消</el-button>
        <el-button type="primary" :loading="replySending" @click="sendReply">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CaretRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'

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

interface FeedbackMessage {
  id: string
  threadId: string
  subject?: string | null
  content: string
  createdAt: string
  fromSchool: boolean
  author: { id: string; realName: string }
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
const { canCollegeFeedback } = useRoles()
const loading = ref(true)
const kind = ref<KindFilter>('all')
const track = ref<TrackFilter>('all')
const items = ref<TodoItem[]>([])
const holding = ref<any>(null)

const feedbackLoading = ref(false)
const feedbackMessages = ref<FeedbackMessage[]>([])
const feedbackSheetOpen = ref(false)
const replyOpen = ref(false)
const replySending = ref(false)
const replyDraft = ref('')
const replyTarget = ref<FeedbackMessage | null>(null)

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
    const threads: any[] = res.items || []
    const details = await Promise.all(
      threads.map(async (t) => {
        try {
          return (await http.get(`/feedback/${t.id}`)) as any
        } catch {
          return null
        }
      }),
    )
    const flat: FeedbackMessage[] = []
    for (const d of details) {
      if (!d?.messages?.length) continue
      for (const m of d.messages) {
        flat.push({
          id: m.id,
          threadId: d.id,
          subject: d.subject,
          content: m.content,
          createdAt: m.createdAt,
          fromSchool: !!m.fromSchool,
          author: m.author || { id: '', realName: '—' },
        })
      }
    }
    flat.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    feedbackMessages.value = flat
  } catch {
    feedbackMessages.value = []
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
  openFeedbackSheet()
}

function openFeedbackSheet() {
  feedbackSheetOpen.value = true
  loadFeedback()
}

function openReply(m: FeedbackMessage) {
  replyTarget.value = m
  replyDraft.value = ''
  replyOpen.value = true
}

async function sendReply() {
  const content = replyDraft.value.trim()
  const target = replyTarget.value
  if (!content || !target) return
  replySending.value = true
  try {
    await http.post(`/feedback/${target.threadId}/messages`, { content })
    ElMessage.success('已发送回复')
    replyOpen.value = false
    replyDraft.value = ''
    replyTarget.value = null
    await loadFeedback()
  } finally {
    replySending.value = false
  }
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
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
  padding: 10px 12px;
  margin-bottom: 10px;
}

.todo-hero-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.todo-hero-text {
  min-width: 0;
}

.todo-hero :deep(h2) {
  margin: 0;
  font-size: 18px;
  line-height: 1.15;
}

.todo-hero :deep(p) {
  margin: 2px 0 0;
  font-size: 11px;
  opacity: 0.8;
  line-height: 1.3;
}

.todo-hero :deep(.nums) {
  margin-top: 0;
  display: flex;
  gap: 6px;
  width: 100%;
}

.todo-hero :deep(.num) {
  flex: 1;
  min-width: 0;
  padding: 6px 4px;
}

.todo-hero :deep(.num strong) {
  font-size: 16px;
}

.todo-hero :deep(.num span) {
  font-size: 10px;
}

@media (min-width: 1024px) {
  .todo-hero {
    padding: 12px 16px;
  }
  .todo-hero-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .todo-hero :deep(h2) {
    font-size: 20px;
  }
  .todo-hero :deep(p) {
    font-size: 12px;
  }
  .todo-hero :deep(.nums) {
    width: auto;
    flex: 1;
    max-width: 520px;
  }
}

.rule-banner {
  margin: 0 0 10px;
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

.feedback-entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid #f0d4d6;
  border-radius: 14px;
  background: linear-gradient(135deg, #fff8f8, #fff);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(122, 69, 72, 0.06);
}
.feedback-entry:active {
  transform: scale(0.995);
}
.fb-entry-copy {
  flex: 1;
  min-width: 0;
}
.fb-entry-copy strong {
  display: block;
  font-size: 15px;
  color: var(--party);
}
.fb-entry-copy em {
  display: block;
  margin-top: 2px;
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
}
.feedback-entry .chev {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  border-radius: 6px;
  background: rgba(143, 78, 82, 0.12);
}
.feedback-entry .chev :deep(.el-icon) {
  font-size: 14px;
  color: var(--party);
}

.drawer-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.45;
}

.fb-msg-list {
  display: grid;
  gap: 10px;
  padding-bottom: 12px;
}

.fb-msg {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: var(--shadow);
}

.fb-msg.school {
  border-color: #f0d4d6;
  background: linear-gradient(180deg, #fff8f8 0%, #fff 42%);
}

.fb-msg.college {
  border-color: #d5e4f2;
  background: linear-gradient(180deg, #f7fbff 0%, #fff 42%);
}

.fb-msg header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}

.fb-msg header div {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.fb-msg header b {
  font-size: 14px;
}

.fb-msg header span {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  background: #eef2f6;
  border-radius: 999px;
  padding: 2px 8px;
}

.fb-msg.school header span {
  color: var(--party);
  background: var(--party-soft, #f8e9ea);
}

.fb-msg.college header span {
  color: var(--joint);
  background: var(--joint-soft, #e8f2f8);
}

.fb-msg header time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted);
}

.fb-subject {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.fb-body {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.fb-reply-btn {
  margin-top: 10px;
  border: 0;
  background: transparent;
  color: var(--joint);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 0;
  cursor: pointer;
}

.reply-quote {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f5f8fb;
  border: 1px solid #e2e8f0;
}

.reply-quote strong {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}

.reply-quote p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
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
