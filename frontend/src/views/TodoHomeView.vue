<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> 按事项办理 · 先审题后签收</div>
      <h2>待办</h2>
      <p>审题是审批，签收材料是确认已阅；同一议题待审时不再重复列出签收。</p>
      <div class="nums">
        <button
          type="button"
          class="num all"
          :class="{ on: kind === 'all' }"
          @click="kind = 'all'"
        >
          <strong>{{ counts.all }}</strong><span>全部</span>
        </button>
        <button
          type="button"
          class="num party"
          :class="{ on: kind === 'review' }"
          @click="kind = 'review'"
        >
          <strong>{{ counts.review }}</strong><span>待审题</span>
        </button>
        <button
          type="button"
          class="num joint"
          :class="{ on: kind === 'read' }"
          @click="kind = 'read'"
        >
          <strong>{{ counts.read }}</strong><span>待签收</span>
        </button>
        <button
          type="button"
          class="num neutral"
          :class="{ on: kind === 'minutes' }"
          @click="kind = 'minutes'"
        >
          <strong>{{ counts.minutes }}</strong><span>纪要</span>
        </button>
        <button
          type="button"
          class="num party"
          :class="{ on: kind === 'supervision' }"
          @click="kind = 'supervision'"
        >
          <strong>{{ counts.supervision }}</strong><span>督办</span>
        </button>
      </div>
    </div>

    <div
      v-if="holding && (!holding.party?.held || !holding.joint?.held)"
      class="rule-banner warn"
    >
      <strong>{{ holding.label }}召开进度未达标</strong>
      党组织会议 {{ holding.party?.count }}/{{ holding.party?.required }}
      · 党政联席会议 {{ holding.joint?.count }}/{{ holding.joint?.required }}。
    </div>

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
        党组织
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
        <div v-else-if="group.key === 'read'" class="read-list">
          <button
            v-for="item in group.items"
            :key="item.id"
            class="read-row"
            :class="trackOf(item)"
            type="button"
            @click="go(item)"
          >
            <span class="mark">阅</span>
            <span class="body">
              <strong>{{ displayTitle(item) }}</strong>
              <em>{{ trackLabel(item) }} · {{ item.subtitle || '确认已阅读材料' }}</em>
            </span>
            <span class="go">去签收 ›</span>
          </button>
        </div>

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

      <div v-if="!visibleGroups.length" class="ui-empty">
        {{ emptyText }}
        <button class="ui-btn" type="button" style="margin-top: 12px" @click="router.push('/work')">
          打开工作台
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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

type KindFilter = 'all' | 'review' | 'read' | 'minutes' | 'supervision'
type TrackFilter = 'all' | 'party' | 'joint'

interface TodoGroup {
  key: KindFilter
  title: string
  hint: string
  items: TodoItem[]
}

const router = useRouter()
const loading = ref(true)
const kind = ref<KindFilter>('all')
const track = ref<TrackFilter>('all')
const items = ref<TodoItem[]>([])
const holding = ref<any>(null)

const TYPE_LABEL: Record<string, string> = {
  JOINT_REVIEW: '联席审题',
  PARTY_REVIEW: '党组织审题',
  MINUTES: '整理纪要',
  MINUTES_SIGN: '整理纪要',
  SUPERVISION: '督办',
  CHECKIN: '签到',
  MATERIAL_READ: '材料签收',
}

const ACTION_LABEL: Record<string, string> = {
  JOINT_REVIEW: '去审题',
  PARTY_REVIEW: '去审题',
  MINUTES: '去整理',
  MINUTES_SIGN: '去整理',
  SUPERVISION: '去反馈',
  CHECKIN: '进入会议',
  MATERIAL_READ: '去签收',
}

const GROUPS: { key: Exclude<KindFilter, 'all'>; title: string; hint: string }[] = [
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
  {
    key: 'read',
    title: '待签收材料',
    hint: '确认已经看过会前材料，不是审批。已在待审题中的议题不会再列在这里。',
  },
]

function typeLabel(t: string) {
  return TYPE_LABEL[t] || t
}

function actionLabel(t: string) {
  return ACTION_LABEL[t] || '办理'
}

function kindOf(item: TodoItem): Exclude<KindFilter, 'all'> {
  if (item.type === 'JOINT_REVIEW' || item.type === 'PARTY_REVIEW') return 'review'
  if (item.type === 'MINUTES' || item.type === 'MINUTES_SIGN') return 'minutes'
  if (item.type === 'SUPERVISION') return 'supervision'
  return 'read'
}

function trackOf(item: TodoItem) {
  if (item.meetingType === 'PARTY_COMMITTEE' || item.type === 'PARTY_REVIEW') return 'party'
  if (item.meetingType === 'JOINT_CONFERENCE' || item.type === 'JOINT_REVIEW') return 'joint'
  if (item.type === 'SUPERVISION') return 'party'
  return 'joint'
}

function trackLabel(item: TodoItem) {
  if (item.meetingType === 'PARTY_COMMITTEE') return '党组织'
  if (item.meetingType === 'JOINT_CONFERENCE') return '党政联席'
  return '综合'
}

function displayTitle(item: TodoItem) {
  return item.title.replace(
    /^(联席会议题待审|党组织会议议题待审|待签收材料|督办待办|待整理纪要|待阅件)[：:]\s*/,
    '',
  )
}

function isOverdue(item: TodoItem) {
  return item.type === 'SUPERVISION' && /逾期/.test(`${item.subtitle || ''}${item.title || ''}`)
}

const trackedItems = computed(() =>
  items.value.filter((i) => {
    if (track.value === 'all') return true
    return track.value === 'party' ? trackOf(i) === 'party' : trackOf(i) === 'joint'
  }),
)

const counts = computed(() => {
  const list = trackedItems.value
  return {
    all: list.length,
    review: list.filter((i) => kindOf(i) === 'review').length,
    read: list.filter((i) => kindOf(i) === 'read').length,
    minutes: list.filter((i) => kindOf(i) === 'minutes').length,
    supervision: list.filter((i) => kindOf(i) === 'supervision').length,
  }
})

const visibleGroups = computed<TodoGroup[]>(() => {
  return GROUPS.map((g) => ({
    ...g,
    items: trackedItems.value.filter((i) => kindOf(i) === g.key),
  })).filter((g) => (kind.value === 'all' ? g.items.length > 0 : g.key === kind.value))
})

const emptyText = computed(() => {
  if (kind.value === 'review') return '当前没有待审议题'
  if (kind.value === 'read') return '当前没有待签收材料'
  if (kind.value === 'minutes') return '当前没有待整理纪要'
  if (kind.value === 'supervision') return '当前没有督办事项'
  return '暂无待办，可到工作台申报议题或查看议题库'
})

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
  } finally {
    loading.value = false
  }
}

function go(item: TodoItem) {
  if (item.meetingId && (item.type === 'MINUTES' || item.type === 'MINUTES_SIGN' || item.type === 'CHECKIN')) {
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
  router.push('/work')
}

onMounted(load)
</script>

<style scoped>
.rule-banner {
  margin: 0 0 12px;
  padding: 12px 14px;
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
.todo-group {
  margin-bottom: 22px;
}
.group-hint {
  margin: -4px 0 12px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}
.read-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.read-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #d9e3eb;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
}
.read-row.party {
  border-color: #f1c6bb;
  background: linear-gradient(160deg, #fff 50%, #fdf6f4 100%);
}
.read-row.joint {
  border-color: #d4e2f4;
  background: linear-gradient(160deg, #fff 50%, #f4f8fc 100%);
}
.read-row .mark {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #eef2f6;
  color: var(--muted);
  display: grid;
  place-items: center;
  font-weight: 700;
  flex-shrink: 0;
  font-size: 13px;
}
.read-row.party .mark {
  background: var(--party-soft);
  color: var(--party);
}
.read-row.joint .mark {
  background: var(--joint-soft);
  color: var(--joint);
}
.read-row .body {
  flex: 1;
  min-width: 0;
}
.read-row strong {
  display: block;
  font-size: 14px;
}
.read-row em {
  display: block;
  margin-top: 2px;
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
}
.read-row .go {
  color: var(--joint);
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}
.read-row.party .go {
  color: var(--party);
}
</style>
