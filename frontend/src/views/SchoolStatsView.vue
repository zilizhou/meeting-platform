<template>
  <div class="overview" :class="{ 'is-m-home': showMobileHome, 'is-m-detail': showMobileDetail }">
    <!-- 手机一级：全校 KPI + 部门列表 -->
    <template v-if="showMobileHome">
      <div class="ui-hero is-official is-compact">
        <div class="hero-row">
          <div class="hero-copy">
            <div class="eyebrow"><b></b> {{ scopeLabel }}</div>
            <h2>总览</h2>
          </div>
          <p class="hero-motto" aria-hidden="false">明德同心，同枢共治</p>
          <div class="nums">
            <div class="kpi party">
              <strong>{{ schoolKpi.partyMeetings }}</strong>
              <span>党委会</span>
            </div>
            <div class="kpi teal">
              <strong>{{ schoolKpi.jointMeetings }}</strong>
              <span>联席会</span>
            </div>
            <div class="kpi sky">
              <strong>{{ schoolKpi.topics }}</strong>
              <span>议题</span>
            </div>
          </div>
        </div>
      </div>

      <section class="m-home-panel" aria-label="部门列表">
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
        <div class="m-home-list" role="listbox">
          <button
            v-for="c in filteredColleges"
            :key="c.collegeId"
            type="button"
            role="option"
            class="m-home-item"
            @click="selectCollege(c.collegeId)"
          >
            <span class="name" :title="c.name">{{ c.name }}</span>
            <em v-if="c.meetingCount != null">{{ c.meetingCount }}</em>
            <span class="chev" aria-hidden="true">›</span>
          </button>
          <div v-if="!filteredColleges.length" class="dept-empty">无匹配部门</div>
        </div>
      </section>
    </template>

    <!-- 电脑双栏 / 手机二级（复用现有详情，暂不重做） -->
    <template v-else>
      <div v-if="!isMobileShell" class="ui-hero is-official is-compact">
        <div class="hero-row">
          <div class="hero-copy">
            <div class="eyebrow"><b></b> {{ scopeLabel }}</div>
            <h2>总览</h2>
          </div>
          <p class="hero-motto" aria-hidden="false">明德同心，同枢共治</p>
          <div class="nums">
            <div class="kpi party">
              <strong>{{ schoolKpi.partyMeetings }}</strong>
              <span>党委会</span>
            </div>
            <div class="kpi teal">
              <strong>{{ schoolKpi.jointMeetings }}</strong>
              <span>联席会</span>
            </div>
            <div class="kpi sky">
              <strong>{{ schoolKpi.topics }}</strong>
              <span>议题</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showMobileDetail" class="m-back-bar">
        <button type="button" class="m-back" @click="backToMobileHome">
          <span class="chev" aria-hidden="true"><el-icon><CaretLeft /></el-icon></span>
          部门
        </button>
        <div class="m-back-title">
          <strong>{{ selectedCollegeName }}</strong>
          <span v-if="!loading">
            会议 {{ listSummary.total }} · 党委 {{ listSummary.party }} · 联席
            {{ listSummary.joint }} · 议题 {{ listSummary.topics }}
          </span>
        </div>
        <button type="button" class="ui-btn ghost m-fb" @click="feedbackOpen = true">反馈</button>
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
        <aside v-if="!isMobileShell" class="dept-pane" aria-label="部门列表">
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
              <div v-if="!isMobileShell" class="detail-head">
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
                    class="season-year"
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
                    :class="[q.season, { on: period === q.key }]"
                    :aria-selected="period === q.key"
                    @click="setPeriod(q.key)"
                  >
                    {{ q.label }}
                  </button>
                </div>
              </div>
              <div class="period-chips is-months" role="tablist" aria-label="月份">
                <div
                  v-for="group in monthSeasonGroups"
                  :key="group.season"
                  class="month-season"
                  :class="group.season"
                >
                  <button
                    v-for="m in group.items"
                    :key="m.key"
                    type="button"
                    role="tab"
                    :class="[m.season, { on: period === m.key }]"
                    :aria-selected="period === m.key"
                    @click="setPeriod(m.key)"
                  >
                    {{ m.label }}
                  </button>
                </div>
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
                    <span class="chev" :class="{ open: isGroupOpen(group.key) }">
                      <el-icon><CaretRight /></el-icon>
                    </span>
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
                          <span class="chev" :class="{ open: isMeetingOpen(m.id) }">
                            <el-icon><CaretRight /></el-icon>
                          </span>
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
                            <span
                              v-if="topic.category?.name"
                              class="topic-cat"
                              :class="`tone-${categoryTone(topic.category)}`"
                              >{{ topic.category.name }}</span
                            >
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
    </template>

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
import { CaretLeft, CaretRight } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useMediaQuery } from '@/composables/useMediaQuery'
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
const isMobileShell = useMediaQuery('(max-width: 1023px)')
const mobilePhase = ref<'home' | 'detail'>('home')
const showMobileHome = computed(() => isMobileShell.value && mobilePhase.value === 'home')
const showMobileDetail = computed(() => isMobileShell.value && mobilePhase.value === 'detail')
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

type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter'

const quarters: Array<{
  key: PeriodKey
  label: string
  startMonth: number
  season: SeasonKey
}> = [
  { key: 'q1', label: '第一季度', startMonth: 0, season: 'spring' },
  { key: 'q2', label: '第二季度', startMonth: 3, season: 'summer' },
  { key: 'q3', label: '第三季度', startMonth: 6, season: 'autumn' },
  { key: 'q4', label: '第四季度', startMonth: 9, season: 'winter' },
]

const months: Array<{ key: PeriodKey; label: string; month: number; season: SeasonKey }> =
  Array.from({ length: 12 }, (_, i) => ({
    key: `m${i + 1}` as PeriodKey,
    label: `${i + 1}月`,
    month: i,
    season: (['spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter', 'winter'] as SeasonKey[])[i],
  }))

const monthSeasonGroups = computed(() => {
  const order: SeasonKey[] = ['spring', 'summer', 'autumn', 'winter']
  return order.map((season) => ({
    season,
    items: months.filter((m) => m.season === season),
  }))
})

const MEETING_STATUS: Record<string, string> = {
  DRAFT: '草稿',
  SCHEDULED: '已排期',
  IN_PROGRESS: '进行中',
  ENDED: '已结束',
  RESOLVED: '已决议',
  ARCHIVED: '已归档',
}

const summary = reactive({ total: 0, party: 0, joint: 0, topics: 0 })
const schoolKpi = reactive({
  partyMeetings: 0,
  jointMeetings: 0,
  topics: 0,
})

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

/** 议题分类三色：理论学习 / 业务科研 / 党建组织 */
type CatTone = 'theory' | 'research' | 'org'

function categoryTone(cat?: { code?: string | null; name?: string | null } | null): CatTone {
  const code = String(cat?.code || '').toUpperCase()
  const name = String(cat?.name || '')
  if (
    ['FIRST_TOPIC', 'IDEOLOGY_EDU', 'IDEOLOGY', 'MORAL'].includes(code) ||
    /理论学习|思政|意识形态|教风学风|师德/.test(name)
  ) {
    return 'theory'
  }
  if (
    ['RESEARCH', 'COOP', 'FACULTY', 'STUDENT', 'REFORM', 'GOVERNANCE', 'AWARD', 'OTHER'].includes(
      code,
    ) ||
    /科研|教学|学生培养|改革发展|学术|表彰|教师队伍/.test(name)
  ) {
    return 'research'
  }
  return 'org'
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
  if (isMobileShell.value) mobilePhase.value = 'detail'
}

function backToMobileHome() {
  mobilePhase.value = 'home'
  feedbackOpen.value = false
  clearTopicFilters()
}

async function loadColleges() {
  const stats: any = await http.get('/admin/stats')
  colleges.value = (stats?.colleges?.items || []).map((c: any) => ({
    collegeId: c.collegeId || c.id,
    name: c.name,
    meetingCount: c.meetingCount,
  }))
  schoolKpi.partyMeetings = Number(stats?.meetings?.party ?? 0)
  schoolKpi.jointMeetings = Number(stats?.meetings?.joint ?? 0)
  schoolKpi.topics = Number(stats?.topics?.total ?? 0)
  // 电脑端默认选中第一项；手机一级首页不预选
  if (!collegeId.value && colleges.value.length && !isMobileShell.value) {
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

watch(isMobileShell, (mobile, wasMobile) => {
  if (mobile === wasMobile) return
  if (!mobile) {
    mobilePhase.value = 'home'
    if (!collegeId.value && colleges.value.length) {
      collegeId.value = colleges.value[0].collegeId
    }
    return
  }
  // 切到手机：回到一级列表，避免残留双栏布局
  mobilePhase.value = 'home'
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
  --ov-ink: #14233a;
  --ov-muted: #64748b;
  --ov-line: #dfe7f1;
  --ov-soft: #f3f6fb;
  --ov-panel: #ffffff;
  --ov-party: #8f4e52;
  --ov-party-soft: #f6ecec;
  --ov-joint: #1a5f8a;
  --ov-joint-soft: #e8f1f8;
  --ov-teal: #1a6f78;
  --ov-teal-soft: #e6f3f4;
  --ov-select: #1a5f8a;
  --ov-shadow: 0 10px 28px rgba(20, 45, 78, 0.07);
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--ov-ink);
}

.overview :deep(.ui-hero.is-official) {
  background:
    radial-gradient(ellipse 72% 90% at 92% -18%, rgba(143, 78, 82, 0.22), transparent 52%),
    radial-gradient(ellipse 55% 70% at -8% 118%, rgba(26, 111, 120, 0.22), transparent 48%),
    linear-gradient(145deg, #102a4a 0%, #1a4f7c 48%, #1c5f7a 100%);
  box-shadow: 0 14px 32px rgba(16, 42, 74, 0.24);
}

.ui-hero.is-compact {
  flex-shrink: 0;
  margin-bottom: 10px;
  padding: 10px 14px;
}
.hero-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  flex-wrap: wrap;
}
.hero-copy {
  min-width: 0;
  flex-shrink: 0;
}
.hero-motto {
  flex: 1 1 auto;
  margin: 0;
  min-width: 0;
  text-align: center;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: rgba(255, 248, 236, 0.92);
  text-shadow: 0 1px 0 rgba(8, 24, 48, 0.25);
  white-space: nowrap;
}
.ui-hero.is-compact :deep(.eyebrow) {
  margin-bottom: 2px;
  font-size: 11px;
  opacity: 0.8;
}
.ui-hero.is-compact h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}
.ui-hero.is-compact :deep(.nums) {
  margin-top: 0;
  gap: 6px;
  flex: 0 0 auto;
  justify-content: flex-end;
  flex-wrap: nowrap;
}
.ui-hero.is-compact :deep(.nums .kpi) {
  padding: 4px 10px 5px;
  border-radius: 8px;
  min-width: 64px;
}
.ui-hero.is-compact :deep(.nums strong) {
  font-size: 16px;
  line-height: 1.1;
}
.ui-hero.is-compact :deep(.nums span) {
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .hero-motto {
    display: none;
  }
}

@media (max-width: 640px) {
  .hero-row {
    align-items: stretch;
  }
  .ui-hero.is-compact :deep(.nums) {
    width: 100%;
    justify-content: stretch;
    flex: 1 1 100%;
  }
  .ui-hero.is-compact :deep(.nums .kpi) {
    flex: 1;
    min-width: 0;
  }
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
  border: 1px solid var(--ov-line);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  color: var(--ov-ink);
  background: var(--ov-panel);
  box-shadow: var(--ov-shadow);
}
.topic-search:focus {
  outline: 2px solid rgba(26, 95, 138, 0.22);
  border-color: #b7cce0;
}
.topic-cat-select {
  flex-shrink: 0;
  min-width: 140px;
  height: 42px;
  border: 1px solid var(--ov-line);
  border-radius: 12px;
  padding: 0 40px 0 12px;
  font: inherit;
  color: var(--ov-ink);
  background-color: var(--ov-panel);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'%3E%3Crect width='22' height='22' rx='6' fill='%231a5f8a' fill-opacity='0.12'/%3E%3Cpath d='M7.2 9.2h7.6L11 14.2 7.2 9.2z' fill='%231a5f8a'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 22px 22px;
  box-shadow: var(--ov-shadow);
  appearance: none;
  -webkit-appearance: none;
}
.topic-cat-select:focus {
  outline: 2px solid rgba(26, 95, 138, 0.22);
  border-color: #b7cce0;
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
  background: var(--ov-panel);
  border: 1px solid rgba(223, 231, 241, 0.9);
  border-radius: 16px;
  box-shadow: var(--ov-shadow);
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
  background: linear-gradient(180deg, #f8fafd 0%, #ffffff 48px);
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
  color: var(--ov-ink);
}
.dept-pane-head span {
  color: var(--ov-muted);
  font-size: 12px;
}
.dept-search {
  flex-shrink: 0;
  margin: 0 12px 8px;
  border: 1px solid var(--ov-line);
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  background: var(--ov-soft);
  color: var(--ov-ink);
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
  color: var(--ov-ink);
}
.dept-item:hover {
  background: var(--ov-soft);
}
.dept-item.on {
  background: var(--ov-joint-soft);
  color: var(--ov-select);
  font-weight: 700;
  box-shadow: inset 3px 0 0 var(--ov-select);
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
  color: var(--ov-muted);
  background: #e8eef5;
  border-radius: 999px;
  min-width: 22px;
  text-align: center;
  padding: 2px 6px;
}
.dept-item.on em {
  background: rgba(255, 255, 255, 0.85);
  color: var(--ov-select);
}
.dept-empty,
.pane-empty {
  color: var(--ov-muted);
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
  background: linear-gradient(180deg, #f9fbfd 0%, #ffffff 100%);
  border-bottom: 1px solid rgba(223, 231, 241, 0.7);
}
.detail-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px 14px;
  background: #f7f9fc;
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
  color: var(--ov-ink);
}
.detail-head p {
  margin: 0;
  color: var(--ov-muted);
  font-size: 12px;
}
.ui-btn.ghost {
  background: var(--ov-joint-soft);
  color: var(--ov-select);
  border: 1px solid transparent;
  flex-shrink: 0;
}
.ui-btn.ghost:hover {
  border-color: #c5d8e8;
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
  border: 1px solid var(--ov-line);
  border-radius: 10px;
  padding: 0 40px 0 10px;
  font: inherit;
  font-weight: 700;
  font-family: var(--font-num), "AppDigits", serif;
  color: var(--ov-ink);
  background-color: #fff;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'%3E%3Crect width='22' height='22' rx='6' fill='%231a5f8a' fill-opacity='0.12'/%3E%3Cpath d='M7.2 9.2h7.6L11 14.2 7.2 9.2z' fill='%231a5f8a'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 22px 22px;
  appearance: none;
  -webkit-appearance: none;
}
.year-select:focus {
  outline: 2px solid rgba(26, 95, 138, 0.2);
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
  gap: 8px;
}
.period-chips.is-months .month-season {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 999px;
}
.period-chips.is-months .month-season.spring {
  background: #d8efe1;
}
.period-chips.is-months .month-season.summer {
  background: #f8ddd3;
}
.period-chips.is-months .month-season.autumn {
  background: #f3e6c4;
}
.period-chips.is-months .month-season.winter {
  background: #d9e8f5;
}
.period-chips button {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--ov-line);
  border-radius: 999px;
  background: #fff;
  color: var(--ov-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.period-chips.is-months button {
  min-width: 44px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.72);
}
.period-chips button:hover {
  color: var(--ov-ink);
  border-color: #c9d6e6;
}
.period-chips button.on {
  background: var(--ov-select);
  border-color: var(--ov-select);
  color: #fff;
  box-shadow: 0 6px 14px rgba(26, 95, 138, 0.22);
}

/* 四季：春绿 / 夏赤 / 秋金 / 冬蓝；同季月份同色 */
.period-chips button.spring {
  color: #2f7a4f;
  border-color: #b7dcc6;
  background: #eef8f1;
}
.period-chips button.summer {
  color: #b54a2e;
  border-color: #efc4b6;
  background: #fdf1ec;
}
.period-chips button.autumn {
  color: #9a6b14;
  border-color: #e6d09a;
  background: #fbf5e6;
}
.period-chips button.winter {
  color: #2f628f;
  border-color: #b6cfe4;
  background: #eef5fb;
}
.period-chips.is-months button.spring,
.period-chips.is-months button.summer,
.period-chips.is-months button.autumn,
.period-chips.is-months button.winter {
  background: rgba(255, 255, 255, 0.78);
}
.period-chips button.spring:hover,
.period-chips button.summer:hover,
.period-chips button.autumn:hover,
.period-chips button.winter:hover {
  filter: brightness(0.98);
}
.period-chips button.spring.on {
  background: #2f7a4f;
  border-color: #2f7a4f;
  color: #fff;
  box-shadow: 0 6px 14px rgba(47, 122, 79, 0.28);
}
.period-chips button.summer.on {
  background: #b54a2e;
  border-color: #b54a2e;
  color: #fff;
  box-shadow: 0 6px 14px rgba(181, 74, 46, 0.28);
}
.period-chips button.autumn.on {
  background: #9a6b14;
  border-color: #9a6b14;
  color: #fff;
  box-shadow: 0 6px 14px rgba(154, 107, 20, 0.28);
}
.period-chips button.winter.on {
  background: #2f628f;
  border-color: #2f628f;
  color: #fff;
  box-shadow: 0 6px 14px rgba(47, 98, 143, 0.28);
}
.period-chips button.season-year.on {
  background: var(--ov-select);
  border-color: var(--ov-select);
  color: #fff;
}
.type-tabs {
  margin: 0 0 12px;
}
.overview :deep(.ui-filter) {
  background: #e8eef5;
}
.overview :deep(.ui-filter button.on) {
  color: var(--ov-select);
}
.overview :deep(.ui-filter button.on.party) {
  color: var(--ov-party);
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
  gap: 10px;
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff7ed;
  color: #9a5b2f;
  font-size: 12px;
}
.filter-hint button {
  border: none;
  background: transparent;
  color: var(--ov-select);
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
  border: 1px solid var(--ov-line);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 4px 14px rgba(20, 45, 78, 0.04);
}
.tree-group.party {
  border-left: 3px solid var(--ov-party);
}
.tree-group.joint {
  border-left: 3px solid var(--ov-teal);
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: var(--ov-soft);
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
  font: inherit;
}
.tree-group.party > .tree-row.is-group {
  background: var(--ov-party-soft);
  color: var(--ov-party);
}
.tree-group.joint > .tree-row.is-group {
  background: var(--ov-teal-soft);
  color: var(--ov-teal);
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
  color: var(--ov-ink);
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 6px;
  background: rgba(26, 95, 138, 0.1);
  transition: transform 0.15s ease, background 0.15s ease;
}
.tree-row .chev :deep(.el-icon) {
  font-size: 14px;
  color: var(--ov-select);
}
.tree-row .chev.open {
  transform: rotate(90deg);
  background: rgba(26, 95, 138, 0.18);
}
.tree-group.party > .tree-row.is-group .chev {
  background: rgba(143, 78, 82, 0.12);
}
.tree-group.party > .tree-row.is-group .chev :deep(.el-icon) {
  color: var(--ov-party);
}
.tree-group.joint > .tree-row.is-group .chev {
  background: rgba(26, 111, 120, 0.12);
}
.tree-group.joint > .tree-row.is-group .chev :deep(.el-icon) {
  color: var(--ov-teal);
}
.tree-row.is-group strong {
  flex: 1;
  font-size: 14px;
}
.tree-row.is-group em {
  font-style: normal;
  font-size: 12px;
  color: var(--ov-muted);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  padding: 2px 8px;
}
.meeting-main {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  padding: 0;
}
.meeting-main strong {
  display: block;
  font-size: 14px;
  color: var(--ov-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meeting-main span {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--ov-muted);
}
.link-btn {
  flex-shrink: 0;
  border: 1px solid var(--ov-line);
  background: #fff;
  color: var(--ov-select);
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.link-btn:hover {
  background: var(--ov-joint-soft);
  border-color: #c5d8e8;
}
.tree-children {
  background: #fff;
}
.tree-empty {
  color: var(--ov-muted);
  font-size: 13px;
  padding: 10px 14px 12px 34px;
}
.topic-children {
  list-style: none;
  margin: 0;
  padding: 4px 8px 10px 34px;
}
.topic-children li + li {
  margin-top: 2px;
}
.topic-link {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  color: var(--ov-ink);
}
.topic-link:hover {
  background: var(--ov-soft);
}
.topic-idx {
  flex-shrink: 0;
  color: var(--ov-muted);
  font-variant-numeric: tabular-nums;
  min-width: 1.4em;
  font-size: 12px;
}
.topic-cat {
  flex-shrink: 0;
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
}
.topic-cat.tone-theory {
  color: #8b2e2e;
  background: #f5e8e8;
}
.topic-cat.tone-research {
  color: #9a6b14;
  background: #fbf5e6;
}
.topic-cat.tone-org {
  color: #3d6b8c;
  background: #e8f0f6;
}
.topic-title {
  min-width: 0;
  line-height: 1.4;
  font-size: 13px;
}
.topic-link:hover .topic-title {
  text-decoration: underline;
}

/* —— 手机一级：部门清单 —— */
.m-home-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ov-panel);
  border: 1px solid rgba(223, 231, 241, 0.9);
  border-radius: 16px;
  box-shadow: var(--ov-shadow);
  overflow: hidden;
}
.m-home-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 8px 12px;
  -webkit-overflow-scrolling: touch;
}
.m-home-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 14px 10px;
  border-radius: 12px;
  cursor: pointer;
  font: inherit;
  color: var(--ov-ink);
  border-bottom: 1px solid #eef2f7;
}
.m-home-item:last-child {
  border-bottom: none;
}
.m-home-item:active {
  background: var(--ov-joint-soft);
}
.m-home-item .name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-home-item em {
  flex-shrink: 0;
  font-style: normal;
  font-size: 12px;
  color: var(--ov-muted);
  background: #e8eef5;
  border-radius: 999px;
  min-width: 28px;
  text-align: center;
  padding: 3px 8px;
}
.m-home-item .chev {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 18px;
  line-height: 1;
}

.m-back-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 4px 0;
}
.m-back {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--ov-select);
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  padding: 4px 2px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.m-back .chev {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  border-radius: 6px;
  background: rgba(26, 95, 138, 0.12);
}
.m-back .chev :deep(.el-icon) {
  font-size: 14px;
  color: var(--ov-select);
}
.m-back-title {
  flex: 1;
  min-width: 0;
}
.m-back-title strong {
  display: block;
  font-size: 16px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-back-title span {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--ov-muted);
}
.m-fb {
  flex-shrink: 0;
  height: 34px;
  padding: 0 12px;
  font-size: 13px;
}

.overview.is-m-home,
.overview.is-m-detail {
  height: auto;
  max-height: none;
  overflow: visible;
}
.overview.is-m-detail .split {
  grid-template-columns: 1fr;
  flex: none;
}
.overview.is-m-detail .detail-pane {
  height: auto;
  min-height: 0;
}
.overview.is-m-detail .detail-scroll {
  max-height: none;
  overflow: visible;
}
.overview.is-m-detail .detail-tools {
  padding-top: 10px;
}

@media (max-width: 1023px) {
  .overview:not(.is-m-home):not(.is-m-detail) {
    height: auto;
    overflow: visible;
  }
}
</style>
