<template>
  <div class="overview">
    <div class="ui-hero is-official is-compact">
      <div class="eyebrow"><b></b> {{ scopeLabel }}</div>
      <h2>总览</h2>
      <p>左侧选部门，右侧按时段展开双会与议题。</p>
    </div>

    <div class="topic-filter-bar">
      <input
        v-model="topicQ"
        type="search"
        class="topic-search"
        placeholder="模糊检索议题标题、会议标题"
      />
      <select v-model="categoryId" class="topic-cat-select" aria-label="议题分类">
        <option value="">全部分类</option>
        <option v-for="c in categoryOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>

    <div class="split">
      <aside class="dept-pane" aria-label="部门列表">
        <div class="dept-pane-head">
          <strong>部门</strong>
          <span>{{ filteredColleges.length }}/{{ colleges.length }}</span>
        </div>
        <input
          v-model="deptQ"
          type="search"
          class="dept-search"
          placeholder="筛选部门名称"
        />
        <div class="dept-list" role="listbox">
          <button
            v-for="c in filteredColleges"
            :key="c.collegeId"
            type="button"
            role="option"
            class="dept-item"
            :aria-selected="collegeId === c.collegeId"
            :class="{ on: collegeId === c.collegeId }"
            @click="selectCollege(c.collegeId)"
          >
            <span class="name" :title="c.name">{{ c.name }}</span>
            <em v-if="c.meetingCount != null">{{ c.meetingCount }}</em>
          </button>
          <div v-if="!filteredColleges.length" class="dept-empty">无匹配部门</div>
        </div>
      </aside>

      <section class="detail-pane">
        <template v-if="collegeId">
          <div class="detail-tools">
            <div class="detail-head">
              <div>
                <h3>{{ selectedCollegeName }}</h3>
                <p v-if="!loading">
                  会议 {{ listSummary.total }} · 党委会 {{ listSummary.party }} · 联席
                  {{ listSummary.joint }} · 议题 {{ listSummary.topics }}
                  <template v-if="hasTopicFilter">（已筛选）</template>
                </p>
              </div>
              <button type="button" class="ui-btn ghost" @click="feedbackOpen = true">反馈</button>
            </div>

            <div class="period-bar">
              <select
                v-model.number="year"
                class="year-select"
                aria-label="年份"
                @change="onYearChange"
              >
                <option v-for="y in yearOptions" :key="y" :value="y">{{ y }} 年</option>
              </select>
              <div class="period-chips" role="tablist" aria-label="季度与全年">
                <button
                  type="button"
                  role="tab"
                  :aria-selected="period === 'year'"
                  :class="{ on: period === 'year' }"
                  @click="setPeriod('year')"
                >
                  全年
                </button>
                <button
                  v-for="q in quarters"
                  :key="q.key"
                  type="button"
                  role="tab"
                  :aria-selected="period === q.key"
                  :class="{ on: period === q.key }"
                  @click="setPeriod(q.key)"
                >
                  {{ q.label }}
                </button>
              </div>
            </div>
            <div class="period-chips is-months" role="tablist" aria-label="月份">
              <button
                v-for="m in months"
                :key="m.key"
                type="button"
                role="tab"
                :aria-selected="period === m.key"
                :class="{ on: period === m.key }"
                @click="setPeriod(m.key)"
              >
                {{ m.label }}
              </button>
            </div>

            <div class="ui-filter is-equal type-tabs" role="tablist" aria-label="会议类型">
              <button
                v-for="t in typeTabs"
                :key="t.key || 'all'"
                type="button"
                role="tab"
                :aria-selected="meetingType === t.key"
                :class="{
                  on: meetingType === t.key,
                  party: t.key === 'PARTY_COMMITTEE',
                }"
                @click="meetingType = t.key"
              >
                {{ t.label }}
                <em>{{ t.count }}</em>
              </button>
            </div>
            <div v-if="hasTopicFilter" class="filter-hint">
              <span>已按议题检索/分类筛选</span>
              <button type="button" @click="clearTopicFilters">清除筛选</button>
            </div>
          </div>

          <div class="detail-scroll">
            <div v-if="loading" class="pane-empty">加载中…</div>
            <div v-else-if="!visibleMeetings.length" class="pane-empty">
              <template v-if="hasTopicFilter">
                <p>当前筛选下没有匹配的会议或议题</p>
                <button type="button" class="ui-btn ghost" @click="clearTopicFilters">清除筛选</button>
              </template>
              <template v-else>该部门在所选时段暂无会议</template>
            </div>

            <div v-else class="tree">
              <div
                v-for="group in visibleTreeGroups"
                :key="group.key"
                class="tree-group"
                :class="group.key === 'PARTY_COMMITTEE' ? 'party' : 'joint'"
              >
                <button
                  type="button"
                  class="tree-row is-group"
                  :aria-expanded="isGroupOpen(group.key)"
                  @click="toggleGroup(group.key)"
                >
                  <span class="chev" :class="{ open: isGroupOpen(group.key) }">▸</span>
                  <strong>{{ group.label }}</strong>
                  <em>{{ group.items.length }}</em>
                </button>

                <div v-show="isGroupOpen(group.key)" class="tree-children">
                  <div v-if="!group.items.length" class="tree-empty">本时段无记录</div>
                  <div v-for="m in group.items" :key="m.id" class="tree-meeting">
                    <div class="tree-row is-meeting">
                      <button
                        type="button"
                        class="expand-hit"
                        :aria-expanded="isMeetingOpen(m.id)"
                        :aria-label="isMeetingOpen(m.id) ? '收起议题' : '展开议题'"
                        @click="toggleMeeting(m.id)"
                      >
                        <span class="chev" :class="{ open: isMeetingOpen(m.id) }">▸</span>
                      </button>
                      <button type="button" class="meeting-main" @click="toggleMeeting(m.id)">
                        <strong>{{ m.title }}</strong>
                        <span
                          >{{ statusLabel(m.status) }} ·
                          {{ formatTime(m.scheduledAt || m.createdAt) }} · 议题
                          {{ m.topics?.length || 0 }}</span
                        >
                      </button>
                      <button type="button" class="link-btn" @click="openMeeting(m)">详情</button>
                    </div>

                    <ul v-show="isMeetingOpen(m.id)" class="topic-children">
                      <li v-if="!m.topics?.length" class="tree-empty">暂无议题</li>
                      <li v-for="(topic, idx) in m.topics || []" :key="topic.id">
                        <button type="button" class="topic-link" @click="openTopic(topic.id)">
                          <span class="topic-idx">{{ idx + 1 }}.</span>
                          <span v-if="topic.category?.name" class="topic-cat">{{ topic.category.name }}</span>
                          <span class="topic-title">{{ topic.title }}</span>
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <div v-else class="pane-empty hint">
          请从左侧选择部门。部门较多时可直接搜索名称。
        </div>
      </section>
    </div>

    <SchoolFeedbackPanel
      :open="feedbackOpen"
      :college-id="collegeId"
      :college-name="selectedCollegeName"
      :can-create="true"
      @close="feedbackOpen = false"
    />

    <SchoolPreviewDrawer
      v-model:kind="previewKind"
      v-model:id="previewId"
      :open="previewOpen"
      @close="previewOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import http from '@/api/http'
import SchoolFeedbackPanel from '@/components/SchoolFeedbackPanel.vue'
import SchoolPreviewDrawer from '@/components/SchoolPreviewDrawer.vue'

interface CollegeRow {
  collegeId: string
  name: string
  meetingCount?: number
}

interface MeetingRow {
  id: string
  title: string
  status: string
  meetingType: string
  scheduledAt?: string
  createdAt: string
  topics?: Array<{
    id: string
    title: string
    category?: { id?: string; name?: string; code?: string } | null
  }>
}

type GroupKey = 'PARTY_COMMITTEE' | 'JOINT_CONFERENCE'
type PeriodKey =
  | 'year'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'm1'
  | 'm2'
  | 'm3'
  | 'm4'
  | 'm5'
  | 'm6'
  | 'm7'
  | 'm8'
  | 'm9'
  | 'm10'
  | 'm11'
  | 'm12'

const auth = useAuthStore()
const colleges = ref<CollegeRow[]>([])
const collegeId = ref('')
const deptQ = ref('')
const meetings = ref<MeetingRow[]>([])
const loading = ref(false)
const feedbackOpen = ref(false)
const previewOpen = ref(false)
const previewKind = ref<'meeting' | 'topic'>('meeting')
const previewId = ref('')
const now = new Date()
const year = ref(now.getFullYear())
const period = ref<PeriodKey>(`q${Math.floor(now.getMonth() / 3) + 1}` as PeriodKey)
const from = ref('')
const to = ref('')
const openGroups = ref<Record<GroupKey, boolean>>({
  PARTY_COMMITTEE: true,
  JOINT_CONFERENCE: true,
})
const openMeetings = ref<Record<string, boolean>>({})
const meetingType = ref('')
const topicQ = ref('')
const categoryId = ref('')

const yearOptions = computed(() => {
  const y = new Date().getFullYear()
  return [y, y - 1, y - 2, y - 3, y - 4]
})

const quarters: Array<{ key: PeriodKey; label: string; startMonth: number }> = [
  { key: 'q1', label: '第一季度', startMonth: 0 },
  { key: 'q2', label: '第二季度', startMonth: 3 },
  { key: 'q3', label: '第三季度', startMonth: 6 },
  { key: 'q4', label: '第四季度', startMonth: 9 },
]

const months: Array<{ key: PeriodKey; label: string; month: number }> = Array.from(
  { length: 12 },
  (_, i) => ({
    key: `m${i + 1}` as PeriodKey,
    label: `${i + 1}月`,
    month: i,
  }),
)

const MEETING_STATUS: Record<string, string> = {
  DRAFT: '草稿',
  SCHEDULED: '已排期',
  IN_PROGRESS: '进行中',
  ENDED: '已结束',
  RESOLVED: '已决议',
  ARCHIVED: '已归档',
}

const summary = reactive({ total: 0, party: 0, joint: 0, topics: 0 })

const filteredColleges = computed(() => {
  const q = deptQ.value.trim().toLowerCase()
  if (!q) return colleges.value
  return colleges.value.filter((c) => c.name.toLowerCase().includes(q))
})

const selectedCollegeName = computed(
  () => colleges.value.find((c) => c.collegeId === collegeId.value)?.name || '—',
)

const scopeLabel = computed(() => {
  const ids = auth.user?.collegeScopeIds || []
  if (ids.length) return `校级分管查阅 · ${colleges.value.map((c) => c.name).join('、') || '分管学院'}`
  if ((auth.user?.roles || []).includes('SCHOOL_VIEWER') && !auth.user?.isSchoolAdmin) {
    return '校级查阅 · 全校'
  }
  return '校级监管 · 全校'
})

/** Tab 数量与下方列表同源：含议题检索/分类筛选结果 */
const typeTabs = computed(() => [
  { key: '', label: '全部', count: filteredMeetings.value.length },
  {
    key: 'PARTY_COMMITTEE',
    label: '党委会',
    count: filteredMeetings.value.filter((m) => m.meetingType === 'PARTY_COMMITTEE').length,
  },
  {
    key: 'JOINT_CONFERENCE',
    label: '党政联席会',
    count: filteredMeetings.value.filter((m) => m.meetingType === 'JOINT_CONFERENCE').length,
  },
])

const hasTopicFilter = computed(() => !!(topicQ.value.trim() || categoryId.value))

const categoryOptions = computed(() => {
  const map = new Map<string, string>()
  for (const m of meetings.value) {
    for (const t of m.topics || []) {
      if (t.category?.id && t.category.name) map.set(t.category.id, t.category.name)
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
})

function applyTopicFilters(list: MeetingRow[]) {
  const q = topicQ.value.trim().toLowerCase()
  const cat = categoryId.value
  if (!q && !cat) return list

  const out: MeetingRow[] = []
  for (const m of list) {
    const meetingHit = q ? m.title.toLowerCase().includes(q) : false
    let topics = [...(m.topics || [])]
    if (cat) topics = topics.filter((t) => t.category?.id === cat)
    if (q) {
      topics = topics.filter(
        (t) => t.title.toLowerCase().includes(q) || meetingHit,
      )
    }
    if (topics.length) {
      out.push({ ...m, topics })
      continue
    }
    // 仅会议标题命中且未选分类时保留会议
    if (meetingHit && !cat) out.push({ ...m, topics: m.topics || [] })
  }
  return out
}

const filteredMeetings = computed(() => applyTopicFilters(meetings.value))

const listSummary = computed(() => {
  const list = filteredMeetings.value
  return {
    total: list.length,
    party: list.filter((m) => m.meetingType === 'PARTY_COMMITTEE').length,
    joint: list.filter((m) => m.meetingType === 'JOINT_CONFERENCE').length,
    topics: list.reduce((n, m) => n + (m.topics?.length || 0), 0),
  }
})

function clearTopicFilters() {
  topicQ.value = ''
  categoryId.value = ''
}

const partyMeetings = computed(() =>
  filteredMeetings.value.filter((m) => m.meetingType === 'PARTY_COMMITTEE'),
)
const jointMeetings = computed(() =>
  filteredMeetings.value.filter((m) => m.meetingType === 'JOINT_CONFERENCE'),
)

const treeGroups = computed(() => [
  { key: 'PARTY_COMMITTEE' as GroupKey, label: '党委会', items: partyMeetings.value },
  { key: 'JOINT_CONFERENCE' as GroupKey, label: '党政联席会', items: jointMeetings.value },
])

const visibleTreeGroups = computed(() => {
  if (!meetingType.value) return treeGroups.value
  return treeGroups.value.filter((g) => g.key === meetingType.value)
})

const visibleMeetings = computed(() => {
  if (meetingType.value === 'PARTY_COMMITTEE') return partyMeetings.value
  if (meetingType.value === 'JOINT_CONFERENCE') return jointMeetings.value
  return filteredMeetings.value
})

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function statusLabel(s: string) {
  return MEETING_STATUS[s] || s
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isGroupOpen(key: GroupKey) {
  return !!openGroups.value[key]
}

function toggleGroup(key: GroupKey) {
  openGroups.value = { ...openGroups.value, [key]: !openGroups.value[key] }
}

function isMeetingOpen(id: string) {
  return openMeetings.value[id] !== false
}

function toggleMeeting(id: string) {
  const next = !(openMeetings.value[id] !== false)
  openMeetings.value = { ...openMeetings.value, [id]: next }
}

function lastDayOfMonth(y: number, monthIndex: number) {
  return isoDay(new Date(y, monthIndex + 1, 0))
}

function setPeriod(key: PeriodKey) {
  period.value = key
  clearTopicFilters()
  applyPeriod()
}

function onYearChange() {
  clearTopicFilters()
  applyPeriod()
}

function applyPeriod() {
  const y = year.value
  if (period.value === 'year') {
    from.value = `${y}-01-01`
    to.value = `${y}-12-31`
    loadMeetings()
    return
  }
  if (period.value.startsWith('q')) {
    const q = quarters.find((item) => item.key === period.value)
    if (!q) return
    from.value = `${y}-${pad(q.startMonth + 1)}-01`
    to.value = lastDayOfMonth(y, q.startMonth + 2)
    loadMeetings()
    return
  }
  if (period.value.startsWith('m')) {
    const m = months.find((item) => item.key === period.value)
    if (!m) return
    from.value = `${y}-${pad(m.month + 1)}-01`
    to.value = lastDayOfMonth(y, m.month)
    loadMeetings()
  }
}

function selectCollege(id: string) {
  collegeId.value = id
}

async function loadColleges() {
  const stats: any = await http.get('/admin/stats')
  colleges.value = (stats?.colleges?.items || []).map((c: any) => ({
    collegeId: c.collegeId || c.id,
    name: c.name,
    meetingCount: c.meetingCount,
  }))
  if (!collegeId.value && colleges.value.length) {
    collegeId.value = colleges.value[0].collegeId
  }
}

async function loadMeetings() {
  if (!collegeId.value) {
    meetings.value = []
    summary.total = 0
    summary.party = 0
    summary.joint = 0
    summary.topics = 0
    return
  }
  loading.value = true
  try {
    const res: any = await http.get('/admin/meetings', {
      params: {
        collegeId: collegeId.value,
        from: from.value || undefined,
        to: to.value || undefined,
      },
    })
    meetings.value = res.items || []
    summary.total = res.summary?.total ?? meetings.value.length
    summary.party =
      res.summary?.party ??
      meetings.value.filter((m) => m.meetingType === 'PARTY_COMMITTEE').length
    summary.joint =
      res.summary?.joint ??
      meetings.value.filter((m) => m.meetingType === 'JOINT_CONFERENCE').length
    summary.topics = meetings.value.reduce((n, m) => n + (m.topics?.length || 0), 0)
    openMeetings.value = Object.fromEntries(meetings.value.map((m) => [m.id, true]))
  } finally {
    loading.value = false
  }
}

function openMeeting(m: MeetingRow) {
  previewKind.value = 'meeting'
  previewId.value = m.id
  previewOpen.value = true
}

function openTopic(id: string) {
  previewKind.value = 'topic'
  previewId.value = id
  previewOpen.value = true
}

watch(collegeId, () => {
  feedbackOpen.value = false
  topicQ.value = ''
  categoryId.value = ''
  loadMeetings()
})

watch([topicQ, categoryId], () => {
  for (const m of filteredMeetings.value) {
    openMeetings.value[m.id] = true
  }
})

watch(categoryOptions, (opts) => {
  if (categoryId.value && !opts.some((o) => o.id === categoryId.value)) {
    categoryId.value = ''
  }
})

onMounted(async () => {
  await loadColleges()
  applyPeriod()
})
</script>

<style scoped>
.overview {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ui-hero.is-compact {
  flex-shrink: 0;
  margin-bottom: 12px;
  padding-bottom: 14px;
}
.ui-hero.is-compact h2 {
  margin-bottom: 4px;
}
.ui-hero.is-compact p {
  margin-bottom: 0;
}

.topic-filter-bar {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.topic-search {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  background: #fff;
  box-shadow: var(--shadow);
}
.topic-cat-select {
  flex-shrink: 0;
  min-width: 140px;
  height: 42px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0 12px;
  font: inherit;
  background: #fff;
  box-shadow: var(--shadow);
}

.split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

.dept-pane,
.detail-pane {
  background: #fff;
  border-radius: 16px;
  box-shadow: var(--shadow);
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dept-pane {
  position: relative;
  top: auto;
  max-height: none;
}
.dept-pane-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 12px 14px 8px;
  flex-shrink: 0;
}
.dept-pane-head strong {
  font-size: 15px;
}
.dept-pane-head span {
  color: var(--muted);
  font-size: 12px;
}
.dept-search {
  flex-shrink: 0;
  margin: 0 12px 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  background: #f7f9fc;
}
.dept-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 8px 10px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.dept-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 10px 10px;
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  color: var(--text);
}
.dept-item:hover {
  background: #f3f6fb;
}
.dept-item.on {
  background: #e8f0fa;
  color: var(--joint);
  font-weight: 700;
}
.dept-item .name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.dept-item em {
  flex-shrink: 0;
  font-style: normal;
  font-size: 11px;
  color: var(--muted);
  background: #eef2f7;
  border-radius: 999px;
  min-width: 22px;
  text-align: center;
  padding: 2px 6px;
}
.dept-item.on em {
  background: rgba(255, 255, 255, 0.7);
  color: var(--joint);
}
.dept-empty,
.pane-empty {
  color: var(--muted);
  text-align: center;
  padding: 28px 16px;
  font-size: 14px;
}
.pane-empty.hint {
  margin: 24px 12px;
}

.detail-pane {
  padding: 0;
}
.detail-tools {
  flex-shrink: 0;
  padding: 14px 14px 0;
}
.detail-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 14px 14px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.detail-head h3 {
  margin: 0 0 4px;
  font-size: 18px;
}
.detail-head p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.ui-btn.ghost {
  background: #eef3fa;
  color: var(--joint);
  border: none;
  flex-shrink: 0;
}
.period-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.year-select {
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0 10px;
  font: inherit;
  font-weight: 600;
  background: #f7f9fc;
  color: var(--text);
}
.year-select:focus {
  outline: 2px solid rgba(15, 53, 95, 0.2);
}
.period-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.period-chips.is-months {
  margin-bottom: 10px;
}
.period-chips button {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #f7f9fc;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.period-chips.is-months button {
  min-width: 44px;
  padding: 0 10px;
}
.period-chips button.on {
  background: var(--joint);
  border-color: var(--joint);
  color: #fff;
}
.type-tabs {
  margin: 0 0 12px;
}
.type-tabs button em {
  font-style: normal;
  margin-left: 6px;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}
.type-tabs button.on em {
  opacity: 1;
}
.filter-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: -4px 0 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f3f6fb;
  color: var(--muted);
  font-size: 12px;
}
.filter-hint button {
  border: none;
  background: transparent;
  color: var(--joint);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.pane-empty p {
  margin: 0 0 12px;
}
.pane-empty .ui-btn {
  margin-top: 4px;
}

.tree {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tree-group {
  border: 1px solid #e8edf3;
  border-radius: 12px;
  overflow: hidden;
}
.tree-group.party {
  border-left: 3px solid var(--party);
}
.tree-group.joint {
  border-left: 3px solid var(--joint);
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: #f8fafc;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
  font: inherit;
}
.tree-row.is-meeting {
  background: #fff;
  border-top: 1px solid #eef2f7;
  cursor: default;
}
.expand-hit {
  border: none;
  background: transparent;
  padding: 4px;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.tree-row .chev {
  color: var(--muted);
  font-size: 12px;
  transition: transform 0.15s ease;
  width: 12px;
  display: inline-block;
}
.tree-row .chev.open {
  transform: rotate(90deg);
}
.tree-row.is-group strong {
  flex: 1;
  font-size: 14px;
}
.tree-row.is-group em {
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
  background: #eef2f7;
  border-radius: 999px;
  padding: 2px 8px;
}
.meeting-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.meeting-main strong {
  font-size: 14px;
  line-height: 1.35;
}
.meeting-main span {
  font-size: 12px;
  color: var(--muted);
}
.link-btn {
  border: none;
  background: transparent;
  color: var(--joint);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  padding: 4px 6px;
}
.tree-children {
  background: #fff;
}
.topic-children {
  list-style: none;
  margin: 0;
  padding: 4px 12px 10px 34px;
  background: #f6f8fb;
}
.topic-children li {
  margin: 0;
}
.topic-link {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 7px 4px;
  font: inherit;
  font-size: 13px;
  color: var(--joint);
  cursor: pointer;
  border-radius: 6px;
}
.topic-link:hover {
  background: rgba(15, 53, 95, 0.06);
}
.topic-idx {
  flex-shrink: 0;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  min-width: 1.4em;
}
.topic-cat {
  flex-shrink: 0;
  color: var(--muted);
  background: #eef2f7;
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 600;
}
.topic-title {
  min-width: 0;
  line-height: 1.4;
}
.topic-link:hover .topic-title {
  text-decoration: underline;
}
.tree-empty {
  color: var(--muted);
  font-size: 13px;
  padding: 10px 14px 12px 34px;
}

@media (max-width: 860px) {
  .overview {
    height: auto;
    max-height: none;
    overflow: visible;
  }
  .split {
    grid-template-columns: 1fr;
    flex: none;
    min-height: 0;
  }
  .dept-pane {
    height: auto;
    max-height: 220px;
  }
  .detail-pane {
    height: auto;
    min-height: 360px;
  }
  .detail-scroll {
    max-height: min(55vh, 520px);
  }
}
</style>
