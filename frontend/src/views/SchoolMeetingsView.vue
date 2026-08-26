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
          <span>党组织会议</span>
        </div>
        <div class="kpi teal">
          <strong>{{ summary.joint }}</strong>
          <span>党政联席会议</span>
        </div>
      </div>
    </div>

    <div class="filter-card">
      <input v-model="q" type="search" placeholder="搜索会议标题、学院名称" @keyup.enter="load" />
      <div class="chips">
        <button
          v-for="p in presets"
          :key="p.key"
          type="button"
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
        <select v-model="meetingType" @change="load">
          <option value="">全部类型</option>
          <option value="PARTY_COMMITTEE">党组织会议</option>
          <option value="JOINT_CONFERENCE">党政联席会议</option>
        </select>
        <button class="ui-btn" type="button" @click="load">查询</button>
      </div>
    </div>

    <section v-if="chartRows.length" class="chart-panel">
      <div class="chart-head">
        <div>
          <h3>各部门会议对照</h3>
          <p>点击学院可筛选下方列表；再点一次取消筛选</p>
        </div>
        <div class="legend">
          <span><i class="party" />党组织</span>
          <span><i class="joint" />联席</span>
        </div>
      </div>
      <div class="college-bars">
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
          {{ m.meetingType === 'PARTY_COMMITTEE' ? '党组织会议' : '党政联席会议' }}
        </span>
        <span class="ui-tag">{{ statusLabel(m.status) }}</span>
      </div>
      <h4>{{ m.title }}</h4>
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
  topics?: unknown[]
}

interface CollegeBar {
  collegeId: string
  name: string
  party: number
  joint: number
  total: number
}

type Preset = 'year' | 'month' | '12m' | 'all'

const CHART_TOP = 10

const router = useRouter()
const q = ref('')
const collegeId = ref('')
const meetingType = ref('')
const from = ref('')
const to = ref('')
const preset = ref<Preset>('year')
const items = ref<MeetingRow[]>([])
/** 图表数据源：不受部门筛选影响，便于对照 */
const chartSource = ref<MeetingRow[]>([])
const colleges = ref<Array<{ collegeId: string; name: string }>>([])
const summary = reactive({ total: 0, party: 0, joint: 0 })

const presets: Array<{ key: Preset; label: string }> = [
  { key: 'year', label: '本年' },
  { key: 'month', label: '本月' },
  { key: '12m', label: '近12个月' },
  { key: 'all', label: '全部' },
]

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
  const sorted = [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'zh'))
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
  else if (key === '12m') from.value = isoDay(new Date(now.getFullYear(), now.getMonth() - 11, 1))
  else from.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
  load()
}

function onCustomDate() {
  preset.value = 'all'
  load()
}

function toggleCollege(id: string) {
  if (id === '__other__') return
  collegeId.value = collegeId.value === id ? '' : id
  load()
}

function open(m: MeetingRow) {
  router.push({
    path: `/meetings/${m.id}`,
    query: { from: 'school' },
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
    colleges.value.length ? Promise.resolve(null) : http.get('/admin/stats'),
  ])
  const payload = unwrapMeetings(list)
  items.value = payload.items
  Object.assign(summary, payload.summary)
  chartSource.value = chartList ? unwrapMeetings(chartList).items : payload.items
  const statsPayload = stats as { colleges?: { items?: Array<{ collegeId: string; name: string }> } } | null
  if (statsPayload?.colleges?.items) colleges.value = statsPayload.colleges.items
}

let timer: number | undefined
watch(q, () => {
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(load, 320)
})

onMounted(() => applyPreset('year'))
</script>

<style scoped>
.filter-card {
  background: #fff;
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}
.filter-card input[type='search'] {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  background: #f7f9fc;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}
.chips button {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 13px;
}
.chips button.on {
  background: var(--joint);
  color: #fff;
  border-color: var(--joint);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
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

.chart-panel {
  background: #fff;
  border-radius: 16px;
  padding: 14px 14px 12px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}
.chart-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.chart-head h3 {
  margin: 0;
  font-size: 15px;
}
.chart-head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.legend {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--muted);
  padding-top: 2px;
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
.meta {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
  text-align: right;
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
  .tracks {
    grid-area: bars;
  }
  .college-row em {
    grid-area: nums;
  }
}
</style>
