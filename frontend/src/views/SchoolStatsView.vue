<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> {{ scopeLabel }}</div>
      <h2>总览</h2>
      <p>所管学院的议题、会议数量与时间分布。数字以系统为准。</p>
      <div class="nums">
        <div class="kpi gold">
          <strong>{{ data?.colleges?.count ?? '—' }}</strong>
          <span>所管部门</span>
        </div>
        <div class="kpi coral">
          <strong>{{ data?.topics?.total ?? '—' }}</strong>
          <span>议题</span>
        </div>
        <div class="kpi sky">
          <strong>{{ data?.meetings?.total ?? '—' }}</strong>
          <span>会议</span>
        </div>
        <div class="kpi mint">
          <strong>{{ data?.holding?.bothOkCount ?? '—' }}</strong>
          <span>双会齐全</span>
        </div>
      </div>
    </div>

    <div class="ui-filter is-equal" role="tablist">
      <button
        v-for="p in presets"
        :key="p.key"
        type="button"
        role="tab"
        :aria-selected="preset === p.key"
        :class="{ on: preset === p.key }"
        @click="applyPreset(p.key)"
      >
        {{ p.label }}
      </button>
    </div>
    <div v-if="preset === 'custom'" class="range-row">
      <input v-model="from" type="date" @change="load" />
      <span>至</span>
      <input v-model="to" type="date" @change="load" />
    </div>

    <div class="stat-grid">
      <article class="stat-card party">
        <h3>党委会</h3>
        <p class="big">{{ data?.meetings?.party ?? 0 }} <em>场</em></p>
        <div class="sub">议题 {{ data?.topics?.party ?? 0 }} 项</div>
      </article>
      <article class="stat-card joint">
        <h3>党政联席会议</h3>
        <p class="big">{{ data?.meetings?.joint ?? 0 }} <em>场</em></p>
        <div class="sub">议题 {{ data?.topics?.joint ?? 0 }} 项</div>
      </article>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h3>按月召开</h3>
        <span>党委会 / 党政联席会议</span>
      </div>
      <div v-if="!monthlyMax" class="ui-empty">所选时段暂无召开数据</div>
      <div v-else class="month-chart">
        <div v-for="row in data?.monthly || []" :key="row.month" class="month-col">
          <div class="bars">
            <div class="bar-wrap">
              <span class="n party">{{ row.partyMeetings }}</span>
              <i class="party" :style="{ height: barH(row.partyMeetings) }" />
            </div>
            <div class="bar-wrap">
              <span class="n joint">{{ row.jointMeetings }}</span>
              <i class="joint" :style="{ height: barH(row.jointMeetings) }" />
            </div>
          </div>
          <em>{{ row.month.slice(5) }}月</em>
        </div>
      </div>
      <div class="legend">
        <span><i class="party" />党委会</span>
        <span><i class="joint" />党政联席会议</span>
      </div>
    </section>

    <section class="panel" :class="{ collapsed: !collegeOpen }">
      <button
        class="panel-toggle"
        type="button"
        :aria-expanded="collegeOpen"
        @click="collegeOpen = !collegeOpen"
      >
        <div class="panel-toggle-text">
          <h3>各部门对照</h3>
          <p v-if="collegeOpen">会议数 / 议题数对照</p>
          <p v-else>共 {{ (data?.colleges?.items || []).length }} 个部门 · 点击展开</p>
        </div>
        <div class="panel-toggle-side">
          <span v-if="collegeOpen" class="legend college-legend">
            <span><i class="meet" />会议数</span>
            <span><i class="topic" />议题数</span>
          </span>
          <span class="chevron" :class="{ open: collegeOpen }" aria-hidden="true">▾</span>
        </div>
      </button>
      <div v-show="collegeOpen">
        <div v-if="!(data?.colleges?.items || []).length" class="ui-empty">暂无部门数据</div>
        <div v-else class="college-bars">
          <div v-for="c in data?.colleges?.items || []" :key="c.collegeId" class="college-row">
            <strong>{{ c.name }}</strong>
            <div class="tracks">
              <div class="track">
                <b
                  v-if="c.meetingCount > 0"
                  class="meet"
                  :style="{ width: pct(c.meetingCount, collegeMax) }"
                />
              </div>
              <div class="track">
                <b
                  v-if="c.topicCount > 0"
                  class="topic"
                  :style="{ width: pct(c.topicCount, collegeMax) }"
                />
              </div>
            </div>
            <em>
              <span class="meet-n">会 {{ c.meetingCount }}</span>
              ·
              <span class="topic-n">题 {{ c.topicCount }}</span>
            </em>
          </div>
        </div>
      </div>
    </section>

    <section class="panel recent-panel">
      <div class="recent-head">
        <div class="ui-filter is-equal" role="tablist" aria-label="近期列表">
          <button
            type="button"
            role="tab"
            :aria-selected="recentTab === 'topics'"
            :class="{ on: recentTab === 'topics' }"
            @click="switchRecentTab('topics')"
          >
            近期议题
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="recentTab === 'meetings'"
            :class="{ on: recentTab === 'meetings' }"
            @click="switchRecentTab('meetings')"
          >
            近期会议
          </button>
        </div>
        <button
          class="panel-link recent-more"
          type="button"
          @click="recentTab === 'topics' ? goTopics() : goMeetings()"
        >
          {{ recentTab === 'topics' ? '查看全部议题 →' : '查看全部会议 →' }}
        </button>
      </div>

      <div ref="recentScrollEl" class="recent-scroll">
        <div v-show="recentTab === 'topics'" class="recent-list">
          <div v-if="!recentTopics.length" class="ui-empty">所选时段暂无议题</div>
          <article
            v-for="t in recentTopics"
            :key="t.id"
            class="list-card"
            :class="t.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint'"
            role="link"
            tabindex="0"
            @click="openTopic(t.id)"
            @keydown.enter="openTopic(t.id)"
          >
            <div class="list-top">
              <span class="ui-tag" :class="t.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint'">
                {{ t.meetingType === 'PARTY_COMMITTEE' ? '党委会' : '党政联席会议' }}
              </span>
              <span class="ui-tag">{{ statusLabel(t.status) }}</span>
            </div>
            <h4>{{ t.title }}</h4>
            <div class="list-meta">
              {{ t.college?.name || '—' }} · {{ t.meeting?.title || '未关联会议' }} ·
              {{ formatDay(t.createdAt) }}
            </div>
          </article>
        </div>

        <div v-show="recentTab === 'meetings'" class="recent-list">
          <div v-if="!recentMeetings.length" class="ui-empty">所选时段暂无会议</div>
          <article
            v-for="m in recentMeetings"
            :key="m.id"
            class="list-card"
            :class="m.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint'"
            role="link"
            tabindex="0"
            @click="openMeeting(m.id)"
            @keydown.enter="openMeeting(m.id)"
          >
            <div class="list-top">
              <span class="ui-tag" :class="m.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint'">
                {{ m.meetingType === 'PARTY_COMMITTEE' ? '党委会' : '党政联席会议' }}
              </span>
              <span class="ui-tag">{{ meetingStatusLabel(m.status) }}</span>
            </div>
            <h4>{{ m.title }}</h4>
            <div class="list-meta">
              {{ m.college?.name || '—' }} · {{ formatDay(m.scheduledAt || m.createdAt) }} ·
              议题 {{ m.topics?.length || 0 }} 项
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 暂时隐藏：简报与预警入口
    <div v-if="auth.user?.isSchoolAdmin" class="jump">
      <button class="w-entry" type="button" @click="router.push('/admin-ops')">
        <div class="ico">报</div>
        <strong>简报与预警</strong>
        <em>领导简报 · 巡视导出</em>
      </button>
    </div>
    -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import http from '@/api/http'

interface MonthlyRow {
  month: string
  partyMeetings: number
  jointMeetings: number
  partyTopics: number
  jointTopics: number
}

interface CollegeRow {
  collegeId: string
  name: string
  topicCount: number
  meetingCount: number
}

interface StatsPayload {
  colleges: { count: number; items: CollegeRow[] }
  topics: { total: number; party: number; joint: number; byStatus: Record<string, number> }
  meetings: { total: number; party: number; joint: number }
  monthly: MonthlyRow[]
  holding?: { label?: string; bothOkCount?: number }
}

interface TopicRow {
  id: string
  title: string
  status: string
  meetingType: string
  createdAt: string
  college?: { name: string }
  meeting?: { title?: string } | null
}

interface MeetingRow {
  id: string
  title: string
  status: string
  meetingType: string
  scheduledAt?: string
  createdAt: string
  college?: { name: string }
  topics?: Array<{ id: string }>
}

type Preset = 'year' | 'quarter' | 'month' | 'all' | 'custom'

const RECENT_LIMIT = 20

const router = useRouter()
const auth = useAuthStore()
const data = ref<StatsPayload | null>(null)
const recentTopics = ref<TopicRow[]>([])
const recentMeetings = ref<MeetingRow[]>([])
const collegeOpen = ref(false)
const recentTab = ref<'topics' | 'meetings'>('topics')
const recentScrollEl = ref<HTMLElement | null>(null)
const preset = ref<Preset>('year')
const from = ref('')
const to = ref('')

const presets: Array<{ key: Preset; label: string }> = [
  { key: 'year', label: '本年' },
  { key: 'quarter', label: '本季' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
  { key: 'custom', label: '自定义' },
]

const TOPIC_STATUS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审',
  DEFERRED: '已暂缓',
  APPROVED: '已通过',
  ON_AGENDA: '已入会',
  DISCUSSED: '待再议',
  RESOLVED: '已决议',
  REJECTED: '未通过',
}

const MEETING_STATUS: Record<string, string> = {
  DRAFT: '草稿',
  SCHEDULED: '已排期',
  IN_PROGRESS: '进行中',
  ENDED: '已结束',
  RESOLVED: '已决议',
  ARCHIVED: '已归档',
}

const scopeLabel = computed(() => {
  const ids = auth.user?.collegeScopeIds || []
  const names = (data.value?.colleges?.items || []).map((c) => c.name)
  if (ids.length) return `校级分管查阅 · ${names.join('、') || '分管学院'}`
  if ((auth.user?.roles || []).includes('SCHOOL_VIEWER') && !auth.user?.isSchoolAdmin) {
    return '校级查阅 · 全校'
  }
  return '校级监管 · 全校'
})

const monthlyMax = computed(() => {
  const rows = data.value?.monthly || []
  return Math.max(0, ...rows.map((r) => Math.max(r.partyMeetings, r.jointMeetings)))
})

const collegeMax = computed(() => {
  const rows = data.value?.colleges?.items || []
  return Math.max(1, ...rows.map((c) => Math.max(c.meetingCount, c.topicCount)))
})

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function today() {
  return isoDay(new Date())
}

function formatDay(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function statusLabel(s: string) {
  return TOPIC_STATUS[s] || s
}

function meetingStatusLabel(s: string) {
  return MEETING_STATUS[s] || s
}

function rangeParams() {
  const params: Record<string, string> = {}
  if (preset.value !== 'all' && from.value) params.from = from.value
  if (preset.value !== 'all' && to.value) params.to = to.value
  return params
}

function applyPreset(key: Preset) {
  preset.value = key
  const now = new Date()
  if (key === 'year') {
    from.value = `${now.getFullYear()}-01-01`
    to.value = today()
    load()
    return
  }
  if (key === 'quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    from.value = isoDay(new Date(now.getFullYear(), quarterStartMonth, 1))
    to.value = today()
    load()
    return
  }
  if (key === 'month') {
    from.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
    to.value = today()
    load()
    return
  }
  if (key === 'all') {
    from.value = ''
    to.value = ''
    load()
    return
  }
}

function barH(n: number) {
  const max = monthlyMax.value || 1
  if (n <= 0) return '2px'
  return `${Math.max(6, Math.round((n / max) * 72))}px`
}

function pct(n: number, max: number) {
  if (n <= 0) return '0%'
  return `${Math.max(6, Math.round((n / Math.max(max, 1)) * 100))}%`
}

function openTopic(id: string) {
  router.push({ path: `/topics/${id}`, query: { from: 'school' } })
}

function openMeeting(id: string) {
  router.push({ path: `/meetings/${id}`, query: { from: 'school' } })
}

function goTopics() {
  router.push('/school-topics')
}

function goMeetings() {
  router.push('/school-meetings')
}

function switchRecentTab(tab: 'topics' | 'meetings') {
  recentTab.value = tab
  if (recentScrollEl.value) recentScrollEl.value.scrollTop = 0
}

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  const items = (payload as { items?: T[] } | null)?.items
  return items || []
}

async function load() {
  const params = rangeParams()
  try {
    const [stats, topics, meetings] = await Promise.all([
      http.get('/admin/stats', { params }),
      http.get('/admin/topics', { params }),
      http.get('/admin/meetings', { params }),
    ])
    data.value = stats as unknown as StatsPayload
    recentTopics.value = unwrapList<TopicRow>(topics).slice(0, RECENT_LIMIT)
    recentMeetings.value = unwrapList<MeetingRow>(meetings).slice(0, RECENT_LIMIT)
  } catch {
    data.value = null
    recentTopics.value = []
    recentMeetings.value = []
  }
}

onMounted(() => {
  applyPreset('year')
})
</script>

<style scoped>
.range-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--muted);
}
.range-row input {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 10px;
  background: #fff;
  font: inherit;
}
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}
.stat-card {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow);
  border-top: 3px solid var(--joint);
}
.stat-card.party {
  border-top-color: var(--party);
}
.stat-card h3 {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.stat-card .big {
  margin: 8px 0 4px;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.04em;
}
.stat-card.party .big {
  color: var(--party);
}
.stat-card.joint .big {
  color: var(--joint);
}
.stat-card em {
  font-size: 13px;
  font-style: normal;
  font-weight: 600;
  color: var(--muted);
}
.stat-card .sub {
  font-size: 12px;
  color: var(--muted);
}
.panel {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}
.panel.collapsed {
  padding-bottom: 12px;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14px;
  gap: 8px;
}
.panel-head h3 {
  margin: 0;
  font-size: 15px;
}
.panel-head span {
  font-size: 12px;
  color: var(--muted);
}
.panel-link {
  border: 0;
  background: transparent;
  color: var(--joint);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.recent-panel {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - var(--tab-h) - var(--safe-b) - 20px);
  overflow: hidden;
  padding-top: 12px;
  padding-bottom: 12px;
}
.recent-head {
  flex: 0 0 auto;
  background: #fff;
  padding-bottom: 8px;
}
.recent-head .ui-filter {
  margin-bottom: 8px;
}
.recent-more {
  display: block;
  width: 100%;
  text-align: right;
}
.recent-scroll {
  flex: 1 1 auto;
  min-height: 180px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
  padding-right: 2px;
}
.recent-list .list-card {
  margin: 0 0 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #f8fafc;
  cursor: pointer;
}
.recent-list .list-card:last-child {
  margin-bottom: 0;
}
.recent-list .list-card:hover {
  border-color: rgba(26, 79, 139, 0.28);
  background: #fff;
}
.recent-list .list-card.party:hover {
  border-color: rgba(176, 48, 48, 0.28);
}
@media (min-width: 1024px) {
  .recent-panel {
    max-height: calc(100dvh - 48px);
  }
}
.list-top {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.list-card h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text);
}
.list-meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}
.panel-toggle {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.panel-toggle-text h3 {
  margin: 0;
  font-size: 15px;
}
.panel-toggle-text p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.panel-toggle-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding-top: 2px;
}
.chevron {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 12px;
  transition: transform 0.18s ease;
}
.chevron.open {
  transform: rotate(180deg);
}
.month-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  min-height: 128px;
  overflow-x: auto;
  padding: 4px 0 4px;
}
.month-col {
  flex: 1;
  min-width: 36px;
  text-align: center;
}
.month-col .bars {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 4px;
  height: 100px;
}
.month-col .bar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  min-width: 14px;
}
.month-col .bar-wrap .n {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.month-col .bar-wrap .n.party {
  color: var(--party);
}
.month-col .bar-wrap .n.joint {
  color: var(--joint);
}
.month-col i {
  display: block;
  width: 10px;
  border-radius: 4px 4px 0 0;
}
.month-col i.party,
.legend i.party {
  background: var(--party);
}
.month-col i.joint,
.legend i.joint {
  background: var(--joint);
}
.month-col em {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  font-style: normal;
  color: var(--muted);
}
.legend {
  display: flex;
  gap: 16px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
.panel-head .legend {
  margin-top: 0;
}
.legend i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 4px;
}
.legend i.meet,
.college-row .track .meet {
  background: var(--joint);
}
.legend i.topic,
.college-row .track .topic {
  background: var(--party);
}
.college-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.college-row {
  display: grid;
  grid-template-columns: minmax(96px, 1.1fr) minmax(120px, 2.2fr) auto;
  gap: 10px;
  align-items: center;
}
.college-row strong {
  font-size: 13px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.college-row .tracks {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.college-row .track {
  height: 8px;
  background: #e8edf5;
  border-radius: 999px;
  overflow: hidden;
}
.college-row .track b {
  display: block;
  height: 100%;
  border-radius: 999px;
  min-width: 0;
}
.college-row em {
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  justify-self: end;
}
.college-row .meet-n {
  color: var(--joint);
  font-weight: 700;
}
.college-row .topic-n {
  color: var(--party);
  font-weight: 700;
}
@media (max-width: 560px) {
  .college-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'name nums'
      'bars bars';
  }
  .college-row strong {
    grid-area: name;
  }
  .college-row .tracks {
    grid-area: bars;
  }
  .college-row em {
    grid-area: nums;
  }
  .panel-toggle-side .legend {
    display: none;
  }
}

.jump {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
@media (min-width: 720px) {
  .jump {
    grid-template-columns: 1fr;
  }
}
</style>
