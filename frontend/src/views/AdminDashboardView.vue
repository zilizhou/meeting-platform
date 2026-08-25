<template>
  <div v-if="!isAdmin" class="deny">
    <el-result
      icon="warning"
      title="无权限"
      sub-title="校级监管看板仅校级管理员或校级查阅角色可访问。"
    >
      <template #extra>
        <el-button type="primary" @click="$router.push('/todo')">返回待办</el-button>
      </template>
    </el-result>
  </div>

  <div v-else class="admin-page">
    <div class="ui-hero is-official">
      <div class="eyebrow">
        <b></b>
        {{
          isViewerOnly
            ? scopeHint
              ? `校级查阅 · ${scopeHint}`
              : '校级查阅'
            : '校级监管 · 学期频次'
        }}
      </div>
      <h2>两会态势总览</h2>
      <p>
        {{
          isViewerOnly
            ? `${monthLabel}召开情况 · 重点看缺开与预警 · AI 领导简报`
            : `${monthLabel}召开情况 · AI 领导简报 · 预警督办 · 巡视导出`
        }}
      </p>
      <div class="nums">
        <div>
          <strong>{{ month?.bothOkCount ?? '—' }}</strong>
          <span>{{ monthLabel }}双会齐全</span>
        </div>
        <div>
          <strong>{{ month?.missingPartyCount ?? '—' }}</strong>
          <span>缺党组织会</span>
        </div>
        <div>
          <strong>{{ month?.missingJointCount ?? '—' }}</strong>
          <span>缺联席会</span>
        </div>
        <div>
          <strong>{{ warningTotal }}</strong>
          <span>预警合计</span>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <el-select
        v-model="collegeId"
        clearable
        placeholder="筛选学院"
        style="width: 200px"
        @change="load"
      >
        <el-option
          v-for="c in colleges"
          :key="c.collegeId || c.id"
          :label="c.name"
          :value="c.collegeId || c.id"
        />
      </el-select>
      <el-button type="primary" :loading="loading" @click="load">刷新</el-button>
      <el-button
        v-if="!isViewerOnly"
        type="warning"
        :loading="scanning"
        @click="scanOverdue"
      >
        扫描逾期
      </el-button>
      <el-button type="success" :loading="exporting" @click="exportPack">
        {{ exportPackLabel }}
      </el-button>
    </div>

    <section v-if="!isViewerOnly" class="ui-sec">
      <h3><i></i> 召开频次</h3>
      <span class="n">按学期或自然月配置应开次数</span>
    </section>
    <div v-if="!isViewerOnly" class="freq-card">
      <div class="freq-row">
        <strong>党组织会议</strong>
        <el-select v-model="freqForm.partyPeriod" style="width: 140px">
          <el-option label="按学期" value="SEMESTER" />
          <el-option label="按自然月" value="MONTH" />
        </el-select>
        <el-input-number v-model="freqForm.partyCount" :min="1" :max="12" />
        <span class="muted">次</span>
      </div>
      <div class="freq-row">
        <strong>党政联席会议</strong>
        <el-select v-model="freqForm.jointPeriod" style="width: 140px">
          <el-option label="按学期" value="SEMESTER" />
          <el-option label="按自然月" value="MONTH" />
        </el-select>
        <el-input-number v-model="freqForm.jointCount" :min="1" :max="12" />
        <span class="muted">次</span>
      </div>
      <el-button type="primary" size="small" :loading="freqSaving" @click="saveFrequency">
        保存频次
      </el-button>
    </div>

    <!-- AI 领导简报 -->
    <section class="brief-card">
      <div class="brief-head">
        <div>
          <h3>AI 领导简报</h3>
          <p>
            {{ briefScopeHint }} · 数字以系统为准 · AI 仅润色文书
          </p>
        </div>
        <div class="brief-actions">
          <el-button
            type="primary"
            :loading="briefingLoading === 'monthly'"
            @click="generateBriefing('monthly', true)"
          >
            生成本月汇报
          </el-button>
          <el-button
            :loading="briefingLoading === 'realtime'"
            @click="generateBriefing('realtime', true)"
          >
            生成实时快报
          </el-button>
        </div>
      </div>
      <div v-if="activeBriefing" class="brief-body">
        <div class="brief-meta">
          <strong>{{ activeBriefing.title }}</strong>
          <span>
            {{ formatTime(activeBriefing.createdAt) }}
            · {{ activeBriefing.demo ? '模板成稿' : 'AI 润色' }}
            <template v-if="activeBriefing.notified != null">
              · 已推送 {{ activeBriefing.notified }} 人
            </template>
          </span>
        </div>
        <pre class="brief-text">{{ activeBriefing.content }}</pre>
        <div class="brief-foot">
          <el-button size="small" @click="copyBriefing">复制全文</el-button>
          <el-button size="small" type="primary" plain @click="downloadBriefing">
            导出文本
          </el-button>
        </div>
      </div>
      <div v-else-if="briefingList.length" class="brief-list">
        <button
          v-for="b in briefingList"
          :key="b.id"
          type="button"
          class="brief-item"
          @click="openBriefing(b.id)"
        >
          <strong>{{ b.title }}</strong>
          <em>{{ formatTime(b.createdAt) }} · {{ b.demo ? '模板' : 'AI' }}</em>
        </button>
      </div>
      <div v-else class="brief-empty">
        尚未生成简报。可点击「生成本月汇报」为校领导形成阅件。
      </div>
    </section>

    <!-- 当前周期缺开 -->
    <section class="ui-sec">
      <h3><i></i> {{ monthLabel }}未按规定召开</h3>
      <span class="n">{{ missingRows.length }} 院次</span>
    </section>

    <div v-if="!missingRows.length" class="ok-banner">
      {{ monthLabel }}各学院党组织会议、党政联席会议均已按规定频次召开/排期
    </div>
    <div v-else class="miss-list">
      <button
        v-for="row in missingRows"
        :key="row.key"
        type="button"
        class="miss-item"
        :class="row.kind"
        @click="focusCollege(row.collegeId)"
      >
        <strong>{{ row.name }}</strong>
        <em>{{ row.label }}</em>
        <span class="chev">筛选 ›</span>
      </button>
    </div>

    <!-- 预警摘要 -->
    <section class="ui-sec">
      <h3><i></i> 预警摘要</h3>
      <span class="n">点击分组查看明细</span>
    </section>
    <div class="warn-chips">
      <button
        v-for="g in warningGroups"
        :key="g.key"
        type="button"
        class="chip"
        :class="{ danger: g.items.length, on: panel === 'warnings' && warnFocus === g.key }"
        @click="openWarnings(g.key)"
      >
        <b>{{ g.items.length }}</b>
        <span>{{ g.title }}</span>
      </button>
    </div>

    <div v-if="panel === 'warnings'" class="warn-panel">
      <div class="warn-panel-head">
        <strong>{{ activeWarnGroup?.title }}</strong>
        <button type="button" class="linkish" @click="panel = 'home'">收起</button>
      </div>
      <el-empty
        v-if="!activeWarnGroup?.items?.length"
        description="暂无"
        :image-size="48"
      />
      <div v-for="(item, idx) in activeWarnGroup?.items || []" :key="idx" class="warn-item">
        <div class="warn-title">
          <el-button
            v-if="item.link"
            link
            type="primary"
            @click="$router.push(item.link)"
          >
            {{ item.title }}
          </el-button>
          <span v-else>{{ item.title }}</span>
        </div>
        <div class="warn-msg">{{ item.message }}</div>
      </div>
    </div>

    <!-- 学院本月对比 -->
    <section class="ui-sec">
      <h3><i></i> 学院召开对比</h3>
      <span class="n">{{ filteredColleges.length }} 所</span>
    </section>
    <el-table :data="filteredColleges" stripe class="college-table">
      <el-table-column prop="name" label="学院" min-width="140" />
      <el-table-column label="党组织会" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.monthPartyHeld ? 'success' : 'danger'">
            {{ row.monthPartyHeld ? '已开' : '未开' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="联席会" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.monthJointHeld ? 'success' : 'danger'">
            {{ row.monthJointHeld ? '已开' : '未开' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="双审完成率" width="110">
        <template #default="{ row }">{{ pct(row.dualReviewRate) }}</template>
      </el-table-column>
      <el-table-column label="督办办结率" width="110">
        <template #default="{ row }">{{ pct(row.supervisionDoneRate) }}</template>
      </el-table-column>
      <el-table-column prop="quorumRiskCount" label="人数风险" width="90" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="focusCollege(row.collegeId || row.id)">
            筛选
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 台账（折叠） -->
    <section class="ui-sec ledger-sec">
      <h3><i></i> 台账与链路</h3>
      <button type="button" class="linkish" @click="showLedger = !showLedger">
        {{ showLedger ? '收起' : '展开' }}
      </button>
    </section>

    <el-tabs v-if="showLedger" v-model="tab">
      <el-tab-pane label="会议台账" name="meetings">
        <el-table :data="meetings" stripe>
          <el-table-column label="学院" width="140">
            <template #default="{ row }">{{ row.college?.name }}</template>
          </el-table-column>
          <el-table-column prop="title" label="会议" min-width="220">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                @click="
                  $router.push(
                    row.meetingType === 'PARTY_COMMITTEE'
                      ? `/meetings/${row.id}?from=party`
                      : `/meetings/${row.id}`,
                  )
                "
              >
                {{ row.title }}
              </el-button>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column label="到会" width="100">
            <template #default="{ row }">
              {{ row.actualAttend }}/{{ row.shouldAttend }}
            </template>
          </el-table-column>
          <el-table-column label="纪要" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="row.minutes ? 'success' : 'info'">
                {{ row.minutes ? '已保存' : '未保存' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="转办链路" name="transfers">
        <el-table :data="transfers" stripe>
          <el-table-column label="学院" width="140">
            <template #default="{ row }">{{ row.sourceTopic?.college?.name }}</template>
          </el-table-column>
          <el-table-column label="党组织会议源议题" min-width="200">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                @click="$router.push(`/topics/${row.sourceTopicId}?from=party`)"
              >
                {{ row.sourceTopic?.title }}
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="联席会目标议题" min-width="200">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                @click="$router.push(`/topics/${row.targetTopicId}`)"
              >
                {{ row.targetTopic?.title }}
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="前置关联" width="100">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="row.targetTopic?.relatedPartyResolutionId ? 'success' : 'danger'"
              >
                {{ row.targetTopic?.relatedPartyResolutionId ? '已关联' : '缺失' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="累计指标" name="totals">
        <div class="stats" v-if="overview">
          <div class="stat"><b>{{ overview.collegeCount }}</b><span>学院数</span></div>
          <div class="stat"><b>{{ overview.jointMeetingCount }}</b><span>联席会议累计</span></div>
          <div class="stat"><b>{{ overview.partyMeetingCount }}</b><span>党组织会累计</span></div>
          <div class="stat"><b>{{ overview.transferCount }}</b><span>转办链路</span></div>
          <div class="stat"><b>{{ pct(overview.supervisionDoneRate) }}</b><span>督办办结率</span></div>
          <div class="stat"><b>{{ pct(overview.compliancePassRate) }}</b><span>合规通过率</span></div>
          <div class="stat warn"><b>{{ overview.supervisionOverdue }}</b><span>逾期督办</span></div>
          <div class="stat warn"><b>{{ overview.complianceFailed }}</b><span>合规失败</span></div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { downloadWithAuth } from '@/api/download'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const loading = ref(false)
const exporting = ref(false)
const scanning = ref(false)
const briefingLoading = ref<'monthly' | 'realtime' | ''>('')
const showLedger = ref(false)
const tab = ref('meetings')
const panel = ref<'home' | 'warnings'>('home')
const warnFocus = ref('month')
const collegeId = ref('')
const overview = ref<any>(null)
const colleges = ref<any[]>([])
const meetings = ref<any[]>([])
const transfers = ref<any[]>([])
const briefingList = ref<any[]>([])
const activeBriefing = ref<any>(null)
const warnings = ref<any>({
  complianceFails: [],
  overdueSupervisions: [],
  unsignedMinutes: [],
  precheckMissing: [],
  monthMissing: [],
})
const freqSaving = ref(false)
const freqForm = reactive({
  partyPeriod: 'SEMESTER',
  partyCount: 1,
  jointPeriod: 'SEMESTER',
  jointCount: 1,
})

const isAdmin = computed(
  () =>
    auth.user?.isSchoolAdmin ||
    auth.user?.roles?.includes('SCHOOL_ADMIN') ||
    auth.user?.roles?.includes('SCHOOL_VIEWER'),
)

const isViewerOnly = computed(() => {
  const roles = auth.user?.roles || []
  const schoolAdmin =
    auth.user?.isSchoolAdmin || roles.includes('SCHOOL_ADMIN')
  return !schoolAdmin && roles.includes('SCHOOL_VIEWER')
})

const scopeHint = computed(() => {
  if (!isViewerOnly.value) return ''
  const ids = auth.user?.collegeScopeIds || []
  return ids.length === 0 ? '全校' : `分管 ${ids.length} 所学院`
})

/** 分管查阅（有 collegeScopes） */
const isScopedViewer = computed(() => {
  if (!isViewerOnly.value) return false
  return (auth.user?.collegeScopeIds || []).length > 0
})

const selectedCollegeName = computed(() => {
  if (!collegeId.value) return ''
  const row = colleges.value.find((c) => (c.collegeId || c.id) === collegeId.value)
  return row?.name || ''
})

const exportPackLabel = computed(() => {
  if (collegeId.value) return '导出本院巡视包'
  if (isScopedViewer.value) return '导出分管巡视包'
  return '导出全校巡视包'
})

const briefScopeHint = computed(() => {
  if (collegeId.value && selectedCollegeName.value) {
    return `范围：${selectedCollegeName.value}`
  }
  if (isScopedViewer.value) return '范围：当前分管学院'
  return '面向组织部与学校主要领导'
})

const month = computed(() => overview.value?.month || null)
const monthLabel = computed(() => month.value?.label || '本学期')

const filteredColleges = computed(() => {
  if (!collegeId.value) return colleges.value
  return colleges.value.filter((c) => (c.collegeId || c.id) === collegeId.value)
})

const missingRows = computed(() => {
  const m = month.value
  if (!m) return [] as Array<{ key: string; collegeId: string; name: string; label: string; kind: string }>
  const filter = (list: any[]) => {
    if (!collegeId.value) return list || []
    return (list || []).filter((c) => c.collegeId === collegeId.value)
  }
  return [
    ...filter(m.missingParty).map((c: any) => ({
      key: `p-${c.collegeId}`,
      collegeId: c.collegeId,
      name: c.name,
      label: '未按规定召开党组织会议',
      kind: 'party',
    })),
    ...filter(m.missingJoint).map((c: any) => ({
      key: `j-${c.collegeId}`,
      collegeId: c.collegeId,
      name: c.name,
      label: '未按规定召开党政联席会议',
      kind: 'joint',
    })),
  ]
})

const warningGroups = computed(() => {
  const filterByCollege = (items: any[]) => {
    if (!collegeId.value) return items || []
    return (items || []).filter((i) => !i.collegeId || i.collegeId === collegeId.value)
  }
  return [
    {
      key: 'month',
      title: '按规定缺开',
      items: filterByCollege(warnings.value.monthMissing),
    },
    {
      key: 'compliance',
      title: '合规失败',
      items: filterByCollege(warnings.value.complianceFails),
    },
    {
      key: 'overdue',
      title: '督办逾期',
      items: filterByCollege(warnings.value.overdueSupervisions),
    },
    {
      key: 'minutes',
      title: '纪要未双签',
      items: filterByCollege(warnings.value.unsignedMinutes),
    },
    {
      key: 'precheck',
      title: '前置把关缺失',
      items: filterByCollege(warnings.value.precheckMissing),
    },
  ]
})

const activeWarnGroup = computed(() =>
  warningGroups.value.find((g) => g.key === warnFocus.value),
)

const warningTotal = computed(() =>
  warningGroups.value.reduce((sum, g) => sum + g.items.length, 0),
)

function pct(n?: number) {
  if (n === undefined || n === null) return '—'
  return `${Math.round(n * 1000) / 10}%`
}

function focusCollege(id: string) {
  collegeId.value = id
  showLedger.value = true
  tab.value = 'meetings'
  load()
}

function openWarnings(key: string) {
  warnFocus.value = key
  panel.value = 'warnings'
}

function formatTime(v?: string) {
  if (!v) return ''
  return new Date(v).toLocaleString('zh-CN')
}

async function loadBriefings() {
  try {
    const params: Record<string, string | number> = { take: 8 }
    if (collegeId.value) params.collegeId = collegeId.value
    briefingList.value = (await http.get('/admin/briefings', { params })) as any
  } catch {
    briefingList.value = []
  }
}

async function openBriefing(id: string) {
  try {
    activeBriefing.value = await http.get(`/admin/briefings/${id}`)
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function generateBriefing(mode: 'monthly' | 'realtime', notify = false) {
  if (!isAdmin.value) return
  briefingLoading.value = mode
  try {
    const res: any = await http.post(
      '/admin/briefings/generate',
      {
        mode,
        notify,
        collegeId: collegeId.value || undefined,
      },
      { timeout: 60000 },
    )
    activeBriefing.value = res
    await loadBriefings()
    ElMessage.success(
      notify && res.notified > 0
        ? `简报已生成，并推送 ${res.notified} 位校级管理员`
        : '简报已生成',
    )
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    briefingLoading.value = ''
  }
}

async function copyBriefing() {
  const text = activeBriefing.value?.content
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制全文')
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

function downloadBriefing() {
  const b = activeBriefing.value
  if (!b?.content) return
  const blob = new Blob([b.content], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(b.title || '校级双会简报').replace(/[\\/:*?"<>|]/g, '_')}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
}

function applyFrequencyRules(rows: any[]) {
  const party = (rows || []).find(
    (r) => r.meetingType === 'PARTY_COMMITTEE' && !r.collegeId,
  )
  const joint = (rows || []).find(
    (r) => r.meetingType === 'JOINT_CONFERENCE' && !r.collegeId,
  )
  if (party) {
    freqForm.partyPeriod = party.period || 'SEMESTER'
    freqForm.partyCount = party.requiredCount || 1
  }
  if (joint) {
    freqForm.jointPeriod = joint.period || 'SEMESTER'
    freqForm.jointCount = joint.requiredCount || 1
  }
}

async function saveFrequency() {
  freqSaving.value = true
  try {
    await http.put('/admin/frequency-rules', {
      rules: [
        {
          meetingType: 'PARTY_COMMITTEE',
          period: freqForm.partyPeriod,
          requiredCount: freqForm.partyCount,
        },
        {
          meetingType: 'JOINT_CONFERENCE',
          period: freqForm.jointPeriod,
          requiredCount: freqForm.jointCount,
        },
      ],
    })
    ElMessage.success('召开频次已保存')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    freqSaving.value = false
  }
}

async function load() {
  if (!isAdmin.value) return
  loading.value = true
  activeBriefing.value = null
  try {
    const params = collegeId.value ? { collegeId: collegeId.value } : {}
    const [o, c, m, t, w, rules] = await Promise.all([
      http.get('/admin/overview'),
      http.get('/admin/colleges'),
      http.get('/admin/meetings', { params }),
      http.get('/admin/transfers', { params }),
      http.get('/admin/warnings'),
      isViewerOnly.value
        ? Promise.resolve([])
        : http.get('/admin/frequency-rules').catch(() => []),
    ])
    overview.value = o
    colleges.value = c as any
    meetings.value = m as any
    transfers.value = t as any
    warnings.value = w as any
    applyFrequencyRules(rules as any[])
    await loadBriefings()
    const qid = String(route.query.briefing || '')
    if (qid) await openBriefing(qid)
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loading.value = false
  }
}

async function scanOverdue() {
  scanning.value = true
  try {
    const res: any = await http.post('/supervisions/scan-overdue')
    ElMessage.success(
      res.marked > 0
        ? `已标记逾期 ${res.marked} 条`
        : `无新增逾期（当前 ${res.overdueCount} 条）`,
    )
    await load()
    openWarnings('overdue')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    scanning.value = false
  }
}

async function exportPack() {
  exporting.value = true
  try {
    const q = collegeId.value ? `?collegeId=${collegeId.value}` : ''
    const day = new Date().toISOString().slice(0, 10)
    const name = collegeId.value
      ? `巡视材料包_学院_${day}.zip`
      : isScopedViewer.value
        ? `巡视材料包_分管_${day}.zip`
        : `巡视材料包_全校_${day}.zip`
    await downloadWithAuth(`/admin/exports/inspection-pack${q}`, name)
    ElMessage.success('巡视材料包已开始下载')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    exporting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.admin-page {
  padding-bottom: 24px;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin: 12px 0 4px;
  flex-wrap: wrap;
  align-items: center;
}
.brief-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 16px;
  margin: 10px 0 14px;
  box-shadow: 0 6px 18px rgba(15, 53, 95, 0.05);
}
.brief-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.brief-head h3 {
  margin: 0;
  font-size: 16px;
  font-family: var(--font-serif);
}
.brief-head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.brief-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.brief-body {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.brief-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.brief-meta span {
  font-size: 12px;
  color: var(--muted);
}
.brief-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f7f9fc;
  border-radius: 10px;
  padding: 14px;
  font-family: var(--font-serif), serif;
  font-size: 14px;
  line-height: 1.75;
  color: #1f2d3d;
  max-height: 360px;
  overflow: auto;
}
.brief-foot {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
.brief-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.brief-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  border: 1px solid var(--line);
  background: #fafbfd;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  font-family: inherit;
}
.brief-item em {
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
  flex-shrink: 0;
}
.brief-empty {
  margin-top: 12px;
  font-size: 13px;
  color: var(--muted);
}
.ok-banner {
  background: #ecf5ff;
  border: 1px solid #b3d8ff;
  color: #1d4f91;
  border-radius: 10px;
  padding: 14px 16px;
  font-size: 14px;
  margin-bottom: 8px;
}
.miss-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.miss-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  align-items: center;
  text-align: left;
  background: #fff;
  border: 1px solid var(--line);
  border-left: 3px solid #1d4f91;
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
}
.miss-item.party {
  border-left-color: #7a4548;
}
.miss-item.joint {
  border-left-color: #2f6f6a;
}
.miss-item strong {
  font-size: 14px;
}
.miss-item em {
  color: var(--muted);
  font-style: normal;
  font-size: 13px;
}
.miss-item .chev {
  color: var(--brand);
  font-size: 13px;
}
.warn-chips {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}
.chip {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 10px;
  text-align: center;
  cursor: pointer;
}
.chip b {
  display: block;
  font-size: 22px;
  color: var(--brand);
  line-height: 1.2;
}
.chip.danger b {
  color: #b45309;
}
.chip span {
  font-size: 12px;
  color: var(--muted);
}
.chip.on {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand) inset;
}
.warn-panel {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.warn-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.linkish {
  border: 0;
  background: none;
  color: var(--brand);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}
.ledger-sec {
  margin-top: 8px;
}
.ledger-sec .linkish {
  margin-left: auto;
}
.warn-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.warn-title {
  font-weight: 600;
  font-size: 13px;
}
.warn-msg {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.stat {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px 16px;
  text-align: center;
}
.stat b {
  display: block;
  font-size: 26px;
  color: var(--brand);
}
.stat span {
  color: var(--muted);
  font-size: 13px;
}
.stat.warn b {
  color: #b45309;
}
.college-table {
  margin-bottom: 8px;
}
.deny {
  background: #fff;
  border-radius: 12px;
}
.freq-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 16px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.freq-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.freq-row strong {
  min-width: 110px;
  font-size: 13px;
}
.freq-card .muted {
  color: var(--muted);
  font-size: 13px;
}
@media (max-width: 960px) {
  .warn-chips {
    grid-template-columns: repeat(3, 1fr);
  }
  .stats {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 640px) {
  .warn-chips,
  .stats {
    grid-template-columns: 1fr 1fr;
  }
  .miss-item {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
