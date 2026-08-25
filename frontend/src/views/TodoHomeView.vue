<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> 待办优先 · 少步办结</div>
      <h2>待办</h2>
      <p>审题、会后决议与纪要集中办理 · 党组织会议须有第一议题方可开会</p>
      <div class="nums">
        <button
          type="button"
          class="num all"
          :class="{ on: filter === 'all' }"
          @click="filter = 'all'"
        >
          <strong>{{ summary.total }}</strong><span>全部</span>
        </button>
        <button
          type="button"
          class="num party"
          :class="{ on: filter === 'party' }"
          @click="filter = 'party'"
        >
          <strong>{{ partyCount }}</strong><span>党组织</span>
        </button>
        <button
          type="button"
          class="num joint"
          :class="{ on: filter === 'joint' }"
          @click="filter = 'joint'"
        >
          <strong>{{ jointCount }}</strong><span>党政联席</span>
        </button>
      </div>
    </div>

    <div
      v-if="holding"
      class="rule-banner"
      :class="{ warn: !holding.party?.held || !holding.joint?.held }"
    >
      <strong>{{ holding.label }}召开进度</strong>
      党组织会议 {{ holding.party?.count }}/{{ holding.party?.required }}
      {{ holding.party?.held ? '已达标' : '未达标' }}
      · 党政联席会议 {{ holding.joint?.count }}/{{ holding.joint?.required }}
      {{ holding.joint?.held ? '已达标' : '未达标' }}。
    </div>
    <div class="rule-banner party">
      <strong>第一议题硬规则</strong>
      党组织会议须将「第一议题（政治理论学习）」纳入议程，否则不能开会。学院管理员可代审通过或退回。
    </div>

    <div class="ui-filter is-equal" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="filter === 'all'"
        :class="{ on: filter === 'all' }"
        @click="filter = 'all'"
      >
        全部
      </button>
      <button
        type="button"
        role="tab"
        class="party"
        :aria-selected="filter === 'party'"
        :class="{ on: filter === 'party' }"
        @click="filter = 'party'"
      >
        党组织
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="filter === 'joint'"
        :class="{ on: filter === 'joint' }"
        @click="filter = 'joint'"
      >
        党政联席
      </button>
    </div>

    <div class="ui-sec">
      <h3><i></i>待我处理</h3>
      <span class="n">{{ filtered.length }} 项</span>
    </div>

    <div v-if="loading" class="ui-empty">加载中…</div>
    <div v-else-if="!filtered.length" class="ui-empty">暂无待办</div>
    <div v-else class="todo-grid">
      <article
        v-for="item in filtered"
        :key="item.id"
        class="ui-card"
        :class="trackOf(item)"
      >
        <div class="top">
          <span class="ui-tag" :class="trackOf(item)">{{ typeLabel(item.type) }}</span>
          <span class="ui-tag" :class="{ warn: item.type === 'SUPERVISION' }">
            {{ item.meetingType === 'PARTY_COMMITTEE' ? '党组织' : item.meetingType === 'JOINT_CONFERENCE' ? '党政联席' : '综合' }}
          </span>
        </div>
        <h4>{{ item.title }}</h4>
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

    <div v-if="focusItems.length" class="ui-sec" style="margin-top: 18px">
      <h3><i style="background: var(--warn)"></i>需关注</h3>
      <span class="n">{{ focusItems.length }} 项</span>
    </div>
    <button
      v-for="item in focusItems"
      :key="'f-' + item.id"
      class="focus-card"
      type="button"
      @click="go(item)"
    >
      <span class="mark">督</span>
      <span class="body">
        <strong>{{ item.title }}</strong>
        <em>{{ item.subtitle }}</em>
      </span>
      <span class="go">查看 ›</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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

const router = useRouter()
const loading = ref(true)
const filter = ref<'all' | 'party' | 'joint'>('all')
const items = ref<TodoItem[]>([])
const holding = ref<any>(null)
const summary = reactive({
  total: 0,
  jointReview: 0,
  partyReview: 0,
  minutesSign: 0,
  supervision: 0,
  checkin: 0,
  materialRead: 0,
})

const TYPE_LABEL: Record<string, string> = {
  JOINT_REVIEW: '联席审题',
  PARTY_REVIEW: '党委审题',
  MINUTES_SIGN: '纪要签署',
  SUPERVISION: '督办',
  CHECKIN: '签到',
  MATERIAL_READ: '阅件',
}

const ACTION_LABEL: Record<string, string> = {
  JOINT_REVIEW: '审题',
  PARTY_REVIEW: '同意',
  MINUTES_SIGN: '签署',
  SUPERVISION: '去督办',
  CHECKIN: '进入会议',
  MATERIAL_READ: '去阅件',
}

function typeLabel(t: string) {
  return TYPE_LABEL[t] || t
}

function actionLabel(t: string) {
  return ACTION_LABEL[t] || '办理'
}

function trackOf(item: TodoItem) {
  if (item.meetingType === 'PARTY_COMMITTEE' || item.type === 'PARTY_REVIEW') return 'party'
  if (item.meetingType === 'JOINT_CONFERENCE' || item.type === 'JOINT_REVIEW') return 'joint'
  if (item.type === 'SUPERVISION') return 'party'
  return 'joint'
}

const partyCount = computed(
  () => items.value.filter((i) => trackOf(i) === 'party').length,
)
const jointCount = computed(
  () => items.value.filter((i) => trackOf(i) === 'joint').length,
)

const filtered = computed(() => {
  return items.value.filter((i) => {
    if (filter.value === 'all') return true
    const track = trackOf(i)
    return filter.value === 'party' ? track === 'party' : track === 'joint'
  })
})

const focusItems = computed(() =>
  items.value.filter(
    (i) => i.type === 'SUPERVISION' && /逾期|超期/.test(`${i.subtitle || ''}${i.title || ''}`),
  ),
)

async function load() {
  loading.value = true
  try {
    const data: any = await http.get('/workspace/todos')
    items.value = data.items || []
    Object.assign(summary, data.summary || {})
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
.rule-banner.party {
  background: #fff7f4;
  border-color: #f1c6bb;
}
.rule-banner strong {
  display: block;
  margin-bottom: 2px;
}
.focus-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 12px 14px;
  margin-bottom: 10px;
  border-radius: 14px;
  border: 1px solid #f5d5d7;
  background: linear-gradient(160deg, #fff 50%, #fdf4f4 100%);
  cursor: pointer;
  font-family: inherit;
  color: inherit;
}

.focus-card .mark {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--party-soft);
  color: var(--party);
  display: grid;
  place-items: center;
  font-weight: 700;
  flex-shrink: 0;
}

.focus-card .body {
  flex: 1;
  min-width: 0;
}

.focus-card strong {
  display: block;
  font-size: 14px;
}

.focus-card em {
  display: block;
  margin-top: 2px;
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
}

.focus-card .go {
  color: var(--party);
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}
</style>
