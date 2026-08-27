<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> 议题办理</div>
      <h2>议题</h2>
      <p>申报、我的议题、议题库在本页切换。</p>
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

    <div class="ui-filter is-equal" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="pane === 'create'"
        :class="{ on: pane === 'create' }"
        @click="setPane('create')"
      >
        申报议题
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="pane === 'mine'"
        :class="{ on: pane === 'mine' }"
        @click="setPane('mine')"
      >
        我的议题
        <template v-if="mine.length"> · {{ mine.length }}</template>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="pane === 'library'"
        :class="{ on: pane === 'library' }"
        @click="setPane('library', 'all')"
      >
        议题库
        <template v-if="topics.length"> · {{ topics.length }}</template>
      </button>
    </div>

    <div class="pane">
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
              {{ isParty(t) ? '党委会' : '党政联席会议' }}
            </span>
            <span class="ui-tag">{{ statusLabel(t.status) }}</span>
          </div>
          <h4>{{ t.title }}</h4>
          <div class="meta">{{ t.category?.name || '未分类' }} · {{ formatDay(t.createdAt) }}</div>
        </article>
      </template>

      <template v-if="pane === 'library'">
        <div class="ui-sec">
          <h3><i></i>议题库</h3>
          <span class="n">{{ libraryList.length }} 项</span>
        </div>
        <div class="ui-filter is-equal library-sub" role="tablist">
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
              {{ isParty(t) ? '党委会' : '党政联席会议' }}
            </span>
            <span class="ui-tag">{{ statusLabel(t.status) }}</span>
          </div>
          <h4>{{ t.title }}</h4>
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
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import TopicCreateView from '@/views/TopicCreateView.vue'

interface TopicRow {
  id: string
  title: string
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

function setPane(next: Pane, filter?: LibraryFilter) {
  pane.value = next
  if (next === 'library' && filter) libraryFilter.value = filter
  syncQuery(next)
}

function syncQuery(next: Pane) {
  const cur = String(route.query.pane || '')
  if (cur === next) return
  router.replace({ query: { ...route.query, pane: next } })
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
  setPane('mine')
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
.pane {
  margin-top: 4px;
}
.library-sub {
  margin-bottom: 10px;
}
.ui-card {
  cursor: pointer;
}
.ui-card h4 {
  margin: 8px 0 0;
}
.meta {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
</style>
