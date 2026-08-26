<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> 议题办理</div>
      <h2>议题</h2>
      <p>申报、我的议题、议题库都在本页切换，不必来回跳转。</p>
      <div class="nums">
        <button type="button" class="num kpi gold" :class="{ on: pane === 'mine' }" @click="setPane('mine')">
          <strong>{{ mine.length }}</strong>
          <span>我的议题</span>
        </button>
        <button
          type="button"
          class="num kpi warn"
          :class="{ on: pane === 'library' && libraryFilter === 'pending' }"
          @click="setPane('library', 'pending')"
        >
          <strong>{{ pendingCount }}</strong>
          <span>待审</span>
        </button>
        <button
          type="button"
          class="num kpi sky"
          :class="{ on: pane === 'library' && libraryFilter === 'all' }"
          @click="setPane('library', 'all')"
        >
          <strong>{{ topics.length }}</strong>
          <span>议题库</span>
        </button>
      </div>
    </div>

    <div class="ui-sec">
      <h3><i></i>议题入口</h3>
      <span class="n">点卡片在下方切换</span>
    </div>
    <div class="ui-grid is-3">
      <button class="w-entry" type="button" :class="{ on: pane === 'create' }" @click="setPane('create')">
        <div class="ico">申</div>
        <strong>申报议题</strong>
        <em>描述事项 · 提交审核</em>
      </button>
      <button class="w-entry" type="button" :class="{ on: pane === 'mine' }" @click="setPane('mine')">
        <div class="ico">我</div>
        <strong>我的议题</strong>
        <em>本人申报 · 跟踪进度</em>
      </button>
      <button
        class="w-entry"
        type="button"
        :class="{ on: pane === 'library' }"
        @click="setPane('library', 'all')"
      >
        <div class="ico">库</div>
        <strong>议题库</strong>
        <em>审题 · 入会准备</em>
      </button>
    </div>

    <div ref="paneEl" class="pane">
      <TopicCreateView
        v-show="pane === 'create'"
        embedded
        @submitted="onCreated"
        @cancel="setPane('mine')"
      />

      <template v-if="pane === 'mine'">
        <div class="ui-sec">
          <h3><i></i>我的议题</h3>
          <span class="n">{{ mine.length }} 项</span>
        </div>
        <div v-if="!mine.length" class="ui-empty">
          暂无本人申报的议题
          <div style="margin-top: 10px">
            <button class="ui-btn" type="button" @click="setPane('create')">去申报议题</button>
          </div>
        </div>
        <article
          v-for="t in mine"
          :key="'mine-' + t.id"
          class="ui-card"
          :class="isParty(t) ? 'party' : 'joint'"
          role="link"
          tabindex="0"
          @click="open(t)"
          @keydown.enter="open(t)"
        >
          <div class="top">
            <span class="ui-tag" :class="isParty(t) ? 'party' : 'joint'">
              {{ isParty(t) ? '党组织会议' : '党政联席会议' }}
            </span>
            <span class="ui-tag">{{ statusLabel(t.status) }}</span>
          </div>
          <h4>{{ t.title }}</h4>
          <p v-if="t.content" class="clip">{{ t.content }}</p>
          <div class="meta">{{ t.category?.name || '未分类' }} · {{ formatDay(t.createdAt) }}</div>
        </article>
      </template>

      <template v-if="pane === 'library'">
        <div class="ui-sec">
          <h3><i></i>议题库</h3>
          <span class="n">{{ libraryList.length }} 项</span>
        </div>
        <div class="ui-filter is-equal" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="libraryFilter === 'all'"
            :class="{ on: libraryFilter === 'all' }"
            @click="libraryFilter = 'all'"
          >
            全部
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="libraryFilter === 'pending'"
            :class="{ on: libraryFilter === 'pending' }"
            @click="libraryFilter = 'pending'"
          >
            待审
          </button>
        </div>
        <div v-if="!libraryList.length" class="ui-empty">当前没有符合条件的议题</div>
        <article
          v-for="t in libraryList"
          :key="'lib-' + t.id"
          class="ui-card"
          :class="isParty(t) ? 'party' : 'joint'"
          role="link"
          tabindex="0"
          @click="open(t)"
          @keydown.enter="open(t)"
        >
          <div class="top">
            <span class="ui-tag" :class="isParty(t) ? 'party' : 'joint'">
              {{ isParty(t) ? '党组织会议' : '党政联席会议' }}
            </span>
            <span class="ui-tag">{{ statusLabel(t.status) }}</span>
          </div>
          <h4>{{ t.title }}</h4>
          <p v-if="t.content" class="clip">{{ t.content }}</p>
          <div class="meta">
            {{ t.proposer?.realName || '—' }} · {{ t.category?.name || '未分类' }} ·
            {{ formatDay(t.createdAt) }}
          </div>
        </article>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import TopicCreateView from '@/views/TopicCreateView.vue'

interface TopicRow {
  id: string
  title: string
  content?: string
  status: string
  meetingType: string
  createdAt: string
  category?: { name: string }
  proposer?: { id?: string; realName: string }
}

type Pane = 'create' | 'mine' | 'library'
type LibraryFilter = 'all' | 'pending'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const topics = ref<TopicRow[]>([])
const pane = ref<Pane>('mine')
const libraryFilter = ref<LibraryFilter>('all')
const paneEl = ref<HTMLElement | null>(null)

const STATUS_MAP: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审',
  DEFERRED: '已暂缓',
  APPROVED: '已通过',
  ON_AGENDA: '已入会',
  DISCUSSED: '待再议',
  RESOLVED: '已决议',
  REJECTED: '未通过',
}

const mine = computed(() => {
  const uid = auth.user?.id
  return topics.value.filter((t) => t.proposer?.id === uid)
})

const pendingCount = computed(
  () =>
    topics.value.filter((t) => t.status === 'PENDING_REVIEW' || t.status === 'DEFERRED')
      .length,
)

const libraryList = computed(() => {
  if (libraryFilter.value !== 'pending') return topics.value
  return topics.value.filter(
    (t) => t.status === 'PENDING_REVIEW' || t.status === 'DEFERRED',
  )
})

function isParty(t: TopicRow) {
  return t.meetingType === 'PARTY_COMMITTEE'
}

function statusLabel(s: string) {
  return STATUS_MAP[s] || s
}

function formatDay(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function setPane(next: Pane, filter?: LibraryFilter) {
  pane.value = next
  if (next === 'library' && filter) libraryFilter.value = filter
  await nextTick()
  paneEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function open(t: TopicRow) {
  router.push({
    path: `/topics/${t.id}`,
    query: { from: isParty(t) ? 'party' : undefined },
  })
}

async function load() {
  try {
    topics.value = (await http.get('/topics')) as TopicRow[]
  } catch {
    topics.value = []
  }
}

async function onCreated() {
  await load()
  await setPane('mine')
}

function applyQueryPane() {
  const q = String(route.query.pane || '')
  if (q === 'create' || q === 'mine' || q === 'library') {
    pane.value = q
  }
}

watch(() => route.query.pane, applyQueryPane)

onMounted(() => {
  applyQueryPane()
  load()
})
</script>

<style scoped>
.ui-grid.is-3 {
  grid-template-columns: repeat(3, 1fr);
}
.w-entry.on {
  border-color: rgba(26, 79, 139, 0.35);
  box-shadow: 0 0 0 2px rgba(26, 79, 139, 0.12);
}
.pane {
  margin-top: 4px;
}
.ui-card {
  cursor: pointer;
}
.ui-card h4 {
  margin: 8px 0 0;
}
.clip {
  margin: 6px 0 0;
  font-size: 13px;
  color: #475569;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 720px) {
  .ui-grid.is-3 {
    grid-template-columns: 1fr;
  }
}
</style>
