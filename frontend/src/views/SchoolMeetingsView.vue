<template>
  <div>
    <div class="ui-hero is-official">
      <div class="eyebrow"><b></b> 校级查阅 · 会议</div>
      <h2>会议</h2>
      <p>按时间、时间段和部门查询所管学院会议。</p>
      <div class="nums">
        <div class="kpi violet">
          <strong>{{ summary.total }}</strong>
          <span>会议总数</span>
        </div>
        <div class="kpi plum">
          <strong>{{ summary.party }}</strong>
          <span>党委会</span>
        </div>
        <div class="kpi teal">
          <strong>{{ summary.joint }}</strong>
          <span>联席会议</span>
        </div>
      </div>
    </div>

    <div class="filter-card">
      <div class="filter-main">
        <input
          v-model="q"
          type="search"
          placeholder="搜索会议标题、学院、议题"
          @keyup.enter="load"
        />
        <button
          class="filter-toggle"
          type="button"
          :class="{ on: filterOpen || activeFilterCount > 0 }"
          :aria-expanded="filterOpen"
          @click="filterOpen = !filterOpen"
        >
          筛选
          <span v-if="activeFilterCount" class="filter-badge">{{ activeFilterCount }}</span>
        </button>
      </div>

      <div v-if="!filterOpen && activeFilterChips.length" class="filter-chips">
        <button
          v-for="chip in activeFilterChips"
          :key="chip.key"
          type="button"
          class="filter-chip"
          @click="clearFilter(chip.key)"
        >
          {{ chip.label }}
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div v-show="filterOpen" class="filter-advanced">
        <div class="ui-filter is-equal meeting-presets" role="tablist" aria-label="会议时间范围">
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
        <div class="row">
          <input v-model="from" type="date" @change="onCustomDate" />
          <span>至</span>
          <input v-model="to" type="date" @change="onCustomDate" />
        </div>
        <div class="row">
          <select v-model="collegeId" @change="load">
            <option value="">全部部门</option>
            <option v-for="c in colleges" :key="c.collegeId" :value="c.collegeId">
              {{ c.name }}
            </option>
          </select>
          <button class="ui-btn" type="button" @click="load">查询</button>
        </div>
      </div>
    </div>

    <section v-if="chartRows.length" class="chart-panel" :class="{ collapsed: !chartOpen }">
      <button
        class="chart-toggle"
        type="button"
        :aria-expanded="chartOpen"
        @click="chartOpen = !chartOpen"
      >
        <div class="chart-toggle-text">
          <h3>各部门会议对照</h3>
          <p v-if="chartOpen">点击学院可筛选下方列表；再点一次取消筛选</p>
          <p v-else>共 {{ chartCollegeCount }} 个部门 · 点击展开</p>
        </div>
        <div class="chart-toggle-side">
          <span v-if="chartOpen" class="legend">
            <span><i class="party" />党委会</span>
            <span><i class="joint" />联席</span>
          </span>
          <span class="chevron" :class="{ open: chartOpen }" aria-hidden="true" />
        </div>
      </button>
      <div v-show="chartOpen" class="college-bars">
        <button
          v-for="row in chartRows"
          :key="row.collegeId"
          type="button"
          class="college-row"
          :class="{ on: collegeId === row.collegeId, muted: row.collegeId === '__other__' }"
          :disabled="row.collegeId === '__other__'"
          @click="toggleCollege(row.collegeId)"
        >
          <strong>{{ row.name }}</strong>
          <div class="tracks">
            <div class="track">
              <b class="party" :style="{ width: barPct(row.party) }" />
            </div>
            <div class="track">
              <b class="joint" :style="{ width: barPct(row.joint) }" />
            </div>
          </div>
          <em>
            <b class="total-n">{{ row.total }}</b>
            <span class="sep">·</span>
            <span class="party-n">{{ row.party }}</span>
            ·
            <span class="joint-n">{{ row.joint }}</span>
          </em>
        </button>
      </div>
    </section>

    <div class="ui-filter is-equal list-type-tabs" role="tablist" aria-label="会议类型">
      <button
        v-for="t in meetingTypes"
        :key="t.key || 'all'"
        type="button"
        role="tab"
        :aria-selected="meetingType === t.key"
        :class="{
          on: meetingType === t.key,
          party: t.key === 'PARTY_COMMITTEE',
        }"
        @click="setMeetingType(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="!items.length" class="ui-empty">没有符合条件的会议</div>
    <article
      v-for="m in items"
      :key="m.id"
      class="ui-card"
      :class="m.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint'"
      role="link"
      tabindex="0"
      @click="open(m)"
      @keydown.enter="open(m)"
    >
      <div class="top">
        <span class="ui-tag" :class="m.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint'">
          {{ m.meetingType === 'PARTY_COMMITTEE' ? '党委会' : '党政联席会议' }}
        </span>
        <span class="ui-tag">{{ statusLabel(m.status) }}</span>
      </div>
      <h4>{{ m.title }}</h4>
      <div class="topic-list" :class="{ empty: !m.topics?.length }">
        <span class="topic-label">会议议题</span>
        <ol v-if="m.topics?.length">
          <li v-for="topic in m.topics" :key="topic.id" :title="topic.title">
            {{ topic.title }}
          </li>
        </ol>
        <span v-else class="topic-empty">暂无议题</span>
      </div>
      <div class="meta">
        {{ m.college?.name || '—' }} · {{ formatTime(m.scheduledAt || m.createdAt) }} ·
        议题 {{ m.topics?.length || 0 }} 项
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import http from '@/api/http'

interface MeetingRow {
  id: string
  title: string
  status: string
  meetingType: string
  scheduledAt?: string
  createdAt: string
  collegeId?: string
  college?: { id?: string; name: string }
  topics?: Array<{ id: string; title: string }>
}

interface CollegeBar {
  collegeId: string
  name: string
  party: number
  joint: number
  total: number
}

type Preset = 'year' | 'quarter' | 'month' | 'all'
type FilterKey = 'collegeId' | 'date' | 'preset'

const CHART_TOP = 10

const router = useRouter()
const q = ref('')
const collegeId = ref('')
const meetingType = ref('')
const from = ref('')
const to = ref('')
const preset = ref<Preset>('year')
const filterOpen = ref(false)
const chartOpen = ref(false)
const items = ref<MeetingRow[]>([])
/** 图表数据源：不受部门筛选影响，便于对照 */
const chartSource = ref<MeetingRow[]>([])
const colleges = ref<Array<{ collegeId: string; name: string }>>([])
const summary = reactive({ total: 0, party: 0, joint: 0 })

const presets: Array<{ key: Preset; label: string }> = [
  { key: 'year', label: '本年' },
  { key: 'quarter', label: '本季' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
]

const meetingTypes: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'PARTY_COMMITTEE', label: '党委会' },
  { key: 'JOINT_CONFERENCE', label: '党政联席会' },
]

function setMeetingType(key: string) {
  if (meetingType.value === key) return
  meetingType.value = key
  load()
}

const STATUS_MAP: Record<string, string> = {
  DRAFT: '草稿',
  SCHEDULED: '已排期',
  IN_PROGRESS: '进行中',
  ENDED: '已结束',
  RESOLVED: '已决议',
  ARCHIVED: '已归档',
}

const chartMax = computed(() => {
  const rows = chartRows.value
  if (!rows.length) return 1
  return Math.max(1, ...rows.flatMap((r) => [r.party, r.joint]))
})

const chartRows = computed(() => {
  const map = new Map<string, CollegeBar>()
  for (const c of colleges.value) {
    if (!c.collegeId) continue
    map.set(c.collegeId, {
      collegeId: c.collegeId,
      name: c.name,
      party: 0,
      joint: 0,
      total: 0,
    })
  }
  for (const m of chartSource.value) {
    const id = m.college?.id || m.collegeId || ''
    if (!id) continue
    const name = m.college?.name || '未知学院'
    let row = map.get(id)
    if (!row) {
      row = { collegeId: id, name, party: 0, joint: 0, total: 0 }
      map.set(id, row)
    }
    if (m.meetingType === 'PARTY_COMMITTEE') row.party += 1
    else if (m.meetingType === 'JOINT_CONFERENCE') row.joint += 1
    row.total += 1
  }
  const sorted = [...map.values()].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name, 'zh'),
  )
  if (sorted.length <= CHART_TOP) return sorted
  const head = sorted.slice(0, CHART_TOP)
  const rest = sorted.slice(CHART_TOP)
  head.push({
    collegeId: '__other__',
    name: `其余 ${rest.length} 个部门`,
    party: rest.reduce((s, r) => s + r.party, 0),
    joint: rest.reduce((s, r) => s + r.joint, 0),
    total: rest.reduce((s, r) => s + r.total, 0),
  })
  return head
})

const chartCollegeCount = computed(() =>
  Math.max(colleges.value.length, chartRows.value.filter((r) => r.collegeId !== '__other__').length),
)

const activeFilterChips = computed(() => {
  const chips: Array<{ key: FilterKey; label: string }> = []
  if (preset.value === 'quarter' || preset.value === 'month') {
    const label = presets.find((p) => p.key === preset.value)?.label
    if (label) chips.push({ key: 'preset', label })
  } else if (preset.value === 'all' && (from.value || to.value)) {
    chips.push({
      key: 'date',
      label: `${from.value || '…'} 至 ${to.value || '…'}`,
    })
  }
  if (collegeId.value) {
    const name = colleges.value.find((c) => c.collegeId === collegeId.value)?.name || '已选部门'
    chips.push({ key: 'collegeId', label: name })
  }
  return chips
})

const activeFilterCount = computed(() => activeFilterChips.value.length)

function statusLabel(s: string) {
  return STATUS_MAP[s] || s
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function barPct(n: number) {
  return `${Math.max(n > 0 ? 6 : 0, Math.round((n / chartMax.value) * 100))}%`
}

function applyPreset(key: Preset) {
  preset.value = key
  const now = new Date()
  if (key === 'all') {
    from.value = ''
    to.value = ''
    load()
    return
  }
  to.value = isoDay(now)
  if (key === 'year') from.value = `${now.getFullYear()}-01-01`
  else if (key === 'quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    from.value = isoDay(new Date(now.getFullYear(), quarterStartMonth, 1))
  }
  else from.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
  load()
}

function onCustomDate() {
  preset.value = 'all'
  load()
}

function clearFilter(key: FilterKey) {
  if (key === 'collegeId') collegeId.value = ''
  if (key === 'date' || key === 'preset') {
    applyPreset('all')
    return
  }
  load()
}

function toggleCollege(id: string) {
  if (id === '__other__') return
  collegeId.value = collegeId.value === id ? '' : id
  chartOpen.value = true
  load()
}

function open(m: MeetingRow) {
  router.push({
    path: `/meetings/${m.id}`,
    query: { from: 'school-meetings' },
  })
}

function unwrapMeetings(list: unknown) {
  if (Array.isArray(list)) {
    return {
      items: list as MeetingRow[],
      summary: { total: list.length, party: 0, joint: 0 },
    }
  }
  const payload = (list || {}) as {
    items?: MeetingRow[]
    summary?: { total: number; party: number; joint: number }
  }
  return {
    items: payload.items || [],
    summary: payload.summary || { total: 0, party: 0, joint: 0 },
  }
}

async function load() {
  const baseParams = {
    q: q.value || undefined,
    meetingType: meetingType.value || undefined,
    from: from.value || undefined,
    to: to.value || undefined,
  }
  const [list, chartList, stats]: unknown[] = await Promise.all([
    http.get('/admin/meetings', {
      params: { ...baseParams, collegeId: collegeId.value || undefined },
    }),
    collegeId.value
      ? http.get('/admin/meetings', { params: baseParams })
      : Promise.resolve(null),
    http.get('/admin/stats'),
  ])
  const payload = unwrapMeetings(list)
  items.value = payload.items
  Object.assign(summary, payload.summary)
  chartSource.value = chartList ? unwrapMeetings(chartList).items : payload.items
  const statsPayload = stats as {
    colleges?: { items?: Array<{ collegeId: string; name: string }> }
  } | null
  if (statsPayload?.colleges?.items?.length) {
    colleges.value = statsPayload.colleges.items
  }
}

let timer: number | undefined
function scheduleLoad() {
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(load, 320)
}
watch(q, scheduleLoad)

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
    filterOpen.value = true
  }
  applyPreset('year')
})
</script>

<style scoped>
.filter-card {
  background: #fff;
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}
.filter-main {
  display: flex;
  gap: 8px;
  align-items: center;
}
.filter-main input[type='search'] {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  background: #f7f9fc;
}
.filter-toggle {
  flex: 0 0 auto;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.filter-toggle.on {
  border-color: rgba(26, 79, 139, 0.35);
  background: #eef4fb;
  color: var(--joint);
}
.filter-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--joint);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  border: 0;
  border-radius: 999px;
  padding: 4px 10px;
  background: #eef2f7;
  color: #334155;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.filter-chip span {
  opacity: 0.55;
  font-size: 14px;
  line-height: 1;
}
.filter-advanced {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eef2f7;
}
.meeting-presets {
  margin: 0 0 8px;
}
.list-type-tabs {
  margin: 0 0 12px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.row + .row {
  margin-top: 8px;
}
.row select,
.row input[type='date'] {
  flex: 1;
  min-width: 120px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  background: #f7f9fc;
}
.row select {
  padding-right: 44px;
  background-color: #f7f9fc;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 22 22'%3E%3Crect width='22' height='22' rx='6' fill='%231a5f8a' fill-opacity='0.14'/%3E%3Cpath d='M6.4 8.6h9.2L11 15.2 6.4 8.6z' fill='%231a5f8a'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 26px 26px;
  appearance: none;
  -webkit-appearance: none;
}

.chart-panel {
  background: #fff;
  border-radius: 16px;
  padding: 10px 14px 12px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}
.chart-panel.collapsed {
  padding-bottom: 10px;
}
.chart-toggle {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.chart-toggle-text {
  min-width: 0;
}
.chart-toggle h3 {
  margin: 0;
  font-size: 15px;
}
.chart-toggle p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.chart-toggle-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding-top: 2px;
}
.chevron {
  display: inline-block;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  background-color: transparent;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 22 22'%3E%3Crect width='22' height='22' rx='6' fill='%231a5f8a' fill-opacity='0.14'/%3E%3Cpath d='M6.4 8.6h9.2L11 15.2 6.4 8.6z' fill='%231a5f8a'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 26px 26px;
  transition: transform 0.18s ease;
}
.chevron.open {
  transform: rotate(180deg);
}
.legend {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--muted);
}
.legend i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 4px;
}
.legend i.party {
  background: var(--party);
}
.legend i.joint {
  background: var(--joint);
}
.college-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.college-row {
  display: grid;
  grid-template-columns: minmax(88px, 1.1fr) minmax(120px, 2.2fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 8px 10px;
  background: #f7f9fc;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: inherit;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}
.college-row:hover:not(:disabled) {
  border-color: #c5d4ea;
  background: #fff;
}
.college-row.on {
  border-color: var(--joint);
  background: #eef4fb;
  box-shadow: inset 3px 0 0 var(--joint);
}
.college-row.muted {
  cursor: default;
  opacity: 0.85;
}
.college-row strong {
  font-size: 13px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tracks {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.track {
  height: 8px;
  background: #e8edf5;
  border-radius: 999px;
  overflow: hidden;
}
.track b {
  display: block;
  height: 100%;
  border-radius: 999px;
  min-width: 0;
  transition: width 0.35s ease;
}
.track b.party {
  background: var(--party);
}
.track b.joint {
  background: var(--joint);
}
.college-row em {
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  justify-self: end;
}
.college-row .total-n {
  color: #1e293b;
  font-weight: 800;
  font-size: 13px;
}
.college-row .sep {
  margin: 0 2px;
}
.college-row .party-n {
  color: var(--party);
  font-weight: 700;
}
.college-row .joint-n {
  color: var(--joint);
  font-weight: 700;
}

.ui-card {
  cursor: pointer;
}
.ui-card h4 {
  margin: 8px 0 0;
}
.topic-list {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(241, 245, 249, 0.82);
  color: #334155;
}
.topic-label {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}
.topic-list ol {
  min-width: 0;
  margin: 0;
  padding-left: 20px;
}
.topic-list li {
  max-width: 100%;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.topic-list li + li {
  margin-top: 3px;
}
.topic-list.empty {
  color: var(--muted);
}
.topic-empty {
  font-size: 12px;
  line-height: 1.6;
}
.meta {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
  text-align: right;
}

@media (max-width: 560px) {
  .topic-list {
    display: block;
  }
  .topic-list ol {
    margin-top: 3px;
  }
  .college-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'name nums'
      'bars bars';
  }
  .college-row strong {
    grid-area: name;
  }
  .tracks {
    grid-area: bars;
  }
  .college-row em {
    grid-area: nums;
  }
  .chart-toggle-side .legend {
    display: none;
  }
}
</style>
