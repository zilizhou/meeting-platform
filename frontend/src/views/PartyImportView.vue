<template>
  <div class="import-page">
    <div class="ui-hero" :class="isParty ? 'party' : 'joint'">
      <div class="eyebrow">
        <b></b> {{ isParty ? '党委红轨' : '联席蓝轨' }} · 历史归档
      </div>
      <h2>历史会议导入</h2>
      <p>
        上传议题表、会议记录、会议纪要。党组织按单场解析；党政联席支持合订本一次导入多场。
        未对齐齐全的场次默认不勾选（规则 B）。纪要按现行规则挂为线下附件归档，不做线上代签。
      </p>
    </div>

    <div class="panel">
      <div class="step-label">1 · 选择会种并上传三件套</div>
      <div class="type-switch" role="tablist">
        <button
          type="button"
          class="party"
          :class="{ on: meetingType === 'PARTY_COMMITTEE' }"
          @click="meetingType = 'PARTY_COMMITTEE'"
        >
          党组织会议
        </button>
        <button
          type="button"
          :class="{ on: meetingType === 'JOINT_CONFERENCE' }"
          @click="meetingType = 'JOINT_CONFERENCE'"
        >
          党政联席会议
        </button>
      </div>
      <div class="uploads">
        <label class="file-card">
          <span>议题表</span>
          <input type="file" accept=".doc,.docx,.txt" @change="onFile('agenda', $event)" />
          <em>{{ files.agenda?.name || '选择 .doc / .docx' }}</em>
        </label>
        <label class="file-card">
          <span>会议记录</span>
          <input type="file" accept=".doc,.docx,.txt" @change="onFile('record', $event)" />
          <em>{{ files.record?.name || '选择 .doc / .docx' }}</em>
        </label>
        <label class="file-card">
          <span>会议纪要</span>
          <input type="file" accept=".doc,.docx,.txt" @change="onFile('minutes', $event)" />
          <em>{{ files.minutes?.name || '选择 .doc / .docx' }}</em>
        </label>
      </div>
      <button
        class="ui-btn"
        :class="isParty ? 'party' : ''"
        type="button"
        style="width: 100%; height: 42px; margin-top: 14px"
        :disabled="!canParse || parsing"
        @click="runPreview"
      >
        {{ parsing ? '解析中…' : '解析并预览' }}
      </button>
    </div>

    <div v-if="preview" class="panel">
      <div class="step-label">
        2 · 核对场次
        <span class="stats">
          共 {{ preview.stats.total }} 场 · 已勾选 {{ selectedCount }} 场
          <template v-if="isParty">
            · 第一议题 {{ preview.stats.withFirstTopic ?? 0 }} 场
          </template>
        </span>
      </div>

      <el-alert
        v-for="(w, i) in preview.warnings"
        :key="'bw' + i"
        :title="w"
        type="warning"
        show-icon
        :closable="false"
        style="margin-bottom: 8px"
      />

      <div class="batch-actions">
        <button class="ui-link" type="button" @click="selectAlignedOnly">仅选齐全</button>
        <button class="ui-link" type="button" @click="selectAll(true)">全选</button>
        <button class="ui-link" type="button" @click="selectAll(false)">全不选</button>
      </div>

      <div
        v-for="(m, mi) in meetings"
        :key="m.key"
        class="meeting-card"
        :class="{ on: m.selected, warn: m.alignStatus !== 'ok' }"
      >
        <label class="meeting-check">
          <input v-model="m.selected" type="checkbox" />
          <div>
            <strong>{{ m.title || m.key }}</strong>
            <div class="meta">
              <el-tag size="small" :type="alignTagType(m.alignStatus)">
                {{ alignLabel(m.alignStatus) }}
              </el-tag>
              <span v-if="m.periodNo">{{ m.periodNo }}</span>
              <span>{{ formatLocal(m.scheduledAt) || '无时间' }}</span>
              <span>{{ m.topics?.length || 0 }} 项议题</span>
              <span>{{ m.people?.length || 0 }} 人</span>
            </div>
          </div>
        </label>

        <div v-if="m.selected" class="meeting-body">
          <el-alert
            v-for="(w, wi) in m.warnings"
            :key="wi"
            :title="w"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 8px"
          />
          <div class="form-grid">
            <label>
              <span>标题</span>
              <input v-model="m.title" />
            </label>
            <label>
              <span>时间</span>
              <input
                :value="toLocalInput(m.scheduledAt)"
                type="datetime-local"
                @change="onScheduleChange(m, ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label>
              <span>地点</span>
              <input v-model="m.location" />
            </label>
            <label>
              <span>主持人</span>
              <input v-model="m.hostName" />
            </label>
            <label>
              <span>记录人</span>
              <input v-model="m.recorderName" />
            </label>
          </div>

          <div class="block-title">
            议题
            <span v-if="isParty" class="hint">党组织会议请标记「第一议题」</span>
          </div>
          <div v-for="(t, ti) in m.topics" :key="ti" class="topic-card">
            <div class="topic-head">
              <input v-model="t.title" placeholder="议题标题" />
              <label v-if="isParty" class="first-topic-toggle">
                <input
                  type="checkbox"
                  :checked="!!t.isFirstTopic"
                  @change="onFirstTopicToggle(m, ti, ($event.target as HTMLInputElement).checked)"
                />
                第一议题
              </label>
            </div>
            <textarea v-model="t.resolutionSummary" rows="2" placeholder="决议摘要" />
          </div>

          <div class="block-title">参会人员</div>
          <el-table :data="m.people" size="small" stripe max-height="220">
            <el-table-column prop="name" label="姓名" width="90" />
            <el-table-column label="匹配" width="90">
              <template #default="{ row }">
                <el-tag :type="row.action === 'link' ? 'success' : 'warning'" size="small">
                  {{ row.action === 'link' ? '已有' : '新建' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="身份" width="90">
              <template #default="{ row }">
                {{ row.isFormal === false ? '列席' : '正式' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-select v-model="row.status" size="small">
                  <el-option label="出席" value="attend" />
                  <el-option label="请假" value="leave" />
                  <el-option label="缺席" value="absent" />
                  <el-option label="回避" value="avoid" />
                </el-select>
              </template>
            </el-table-column>
          </el-table>

          <div class="block-title">纪要正文（线下附件将同步挂载 Word 原件）</div>
          <textarea v-model="m.minutesContent" rows="6" class="minutes" />
        </div>

        <button
          v-else
          class="ui-link expand"
          type="button"
          @click="m.selected = true"
        >
          勾选并编辑
        </button>
      </div>

      <div class="actions">
        <button class="ui-btn light" type="button" @click="router.back()">取消</button>
        <button
          class="ui-btn"
          :class="isParty ? 'party' : ''"
          type="button"
          :disabled="confirming || !selectedCount"
          @click="runConfirm"
        >
          {{ confirming ? '导入中…' : `确认导入 ${selectedCount} 场并归档` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'

type MeetingType = 'PARTY_COMMITTEE' | 'JOINT_CONFERENCE'
type AlignStatus = 'ok' | 'partial' | 'agenda_only' | 'missing_agenda'

type Draft = {
  key: string
  selected: boolean
  alignStatus: AlignStatus
  periodNo: string | null
  scheduledAt: string | null
  location: string
  title: string
  hostName: string
  recorderName: string
  topics: Array<{
    sortOrder: number
    title: string
    resolutionSummary: string
    minutesSection: string
    isFirstTopic?: boolean
  }>
  people: Array<{
    name: string
    userId?: string
    username?: string
    action: 'link' | 'create'
    isFormal: boolean
    status: 'attend' | 'leave' | 'absent' | 'avoid'
  }>
  minutesContent: string
  warnings: string[]
  raw: { agendaText: string; recordText: string; minutesText: string }
}

type Preview = {
  meetingType: MeetingType
  collegeNameHint: string
  collegeId: string | null
  collegeName: string | null
  warnings: string[]
  meetings: Draft[]
  stats: {
    total: number
    selected: number
    unselected: number
    withFirstTopic?: number
    missingFirstTopic?: number
  }
}

const router = useRouter()
const route = useRoute()

const meetingType = ref<MeetingType>(
  String(route.query.type || '') === 'joint'
    ? 'JOINT_CONFERENCE'
    : 'PARTY_COMMITTEE',
)
const isParty = computed(() => meetingType.value === 'PARTY_COMMITTEE')

const files = reactive<{
  agenda: File | null
  record: File | null
  minutes: File | null
}>({ agenda: null, record: null, minutes: null })

const parsing = ref(false)
const confirming = ref(false)
const preview = ref<Preview | null>(null)
const meetings = ref<Draft[]>([])
const collegeId = ref('')

const canParse = computed(() => !!(files.agenda && files.record && files.minutes))
const selectedCount = computed(() => meetings.value.filter((m) => m.selected).length)

watch(meetingType, () => {
  preview.value = null
  meetings.value = []
})

function onFile(slot: 'agenda' | 'record' | 'minutes', e: Event) {
  const input = e.target as HTMLInputElement
  files[slot] = input.files?.[0] || null
  preview.value = null
  meetings.value = []
}

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(local: string) {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function onScheduleChange(m: Draft, local: string) {
  m.scheduledAt = fromLocalInput(local)
}

function formatLocal(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function alignLabel(s: AlignStatus) {
  if (s === 'ok') return '三件齐全'
  if (s === 'partial') return '部分缺失'
  if (s === 'agenda_only') return '仅议题表'
  return '缺议题表'
}

function alignTagType(s: AlignStatus) {
  if (s === 'ok') return 'success'
  if (s === 'partial') return 'warning'
  return 'info'
}

function selectAlignedOnly() {
  for (const m of meetings.value) m.selected = m.alignStatus === 'ok'
}

function selectAll(v: boolean) {
  for (const m of meetings.value) m.selected = v
}

/** 一场会议至多一条第一议题 */
function onFirstTopicToggle(m: Draft, topicIndex: number, checked: boolean) {
  for (let i = 0; i < (m.topics || []).length; i++) {
    m.topics[i].isFirstTopic = checked && i === topicIndex
  }
}

async function runPreview() {
  if (!canParse.value) return
  parsing.value = true
  try {
    const fd = new FormData()
    fd.append('agenda', files.agenda!)
    fd.append('record', files.record!)
    fd.append('minutes', files.minutes!)
    fd.append('meetingType', meetingType.value)
    const data = (await http.post('/meeting-import/preview', fd, {
      timeout: 120000,
    })) as Preview
    preview.value = data
    meetingType.value = data.meetingType
    collegeId.value = data.collegeId || ''
    meetings.value = (data.meetings || []).map((m) => ({
      ...m,
      topics: (m.topics || []).map((t) => ({ ...t })),
      people: (m.people || []).map((p) => ({ ...p })),
      warnings: [...(m.warnings || [])],
      raw: { ...m.raw },
    }))
    ElMessage.success(
      `解析完成：${data.stats.total} 场，默认勾选 ${data.stats.selected} 场`,
    )
  } catch (e: any) {
    ElMessage.error(typeof e === 'string' ? e : e?.message || '解析失败')
  } finally {
    parsing.value = false
  }
}

async function runConfirm() {
  if (!preview.value || !selectedCount.value) return
  const forced = meetings.value.filter(
    (m) => m.selected && m.alignStatus !== 'ok',
  )
  try {
    await ElMessageBox.confirm(
      forced.length
        ? `将导入 ${selectedCount.value} 场（其中 ${forced.length} 场未对齐齐全）。纪要挂线下附件并直接归档，确认继续？`
        : `确认导入 ${selectedCount.value} 场？纪要按线下附件归档（无线上代签），缺失人员将自动建账号（密码 123456）。`,
      '确认导入归档',
      { type: 'warning', confirmButtonText: '确认导入', cancelButtonText: '再看看' },
    )
  } catch {
    return
  }

  confirming.value = true
  try {
    const payload = {
      meetingType: meetingType.value,
      collegeId: collegeId.value || undefined,
      meetings: meetings.value,
    }
    const fd = new FormData()
    fd.append('agenda', files.agenda!)
    fd.append('record', files.record!)
    fd.append('minutes', files.minutes!)
    fd.append('payload', JSON.stringify(payload))
    const result = (await http.post('/meeting-import/confirm', fd, {
      timeout: 180000,
    })) as {
      count: number
      link?: string
      meetings: Array<{ meetingId: string; link: string }>
      createdUsers: Array<{ username: string; realName: string }>
    }
    const created = result.createdUsers?.length
      ? `；新建 ${result.createdUsers.length} 人`
      : ''
    ElMessage.success(`已归档 ${result.count} 场会议${created}`)
    const link =
      result.link ||
      result.meetings?.[0]?.link ||
      (meetingType.value === 'JOINT_CONFERENCE'
        ? '/meet?tab=joint&status=archived'
        : '/meet?tab=party&status=archived')
    router.push(link)
  } catch (e: any) {
    ElMessage.error(typeof e === 'string' ? e : e?.message || '导入失败')
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.import-page {
  max-width: 960px;
}
.panel {
  background: #fff;
  border: 1px solid var(--line, #e6e8ee);
  border-radius: 12px;
  padding: 16px 18px 18px;
  margin-bottom: 14px;
}
.step-label {
  font-weight: 700;
  margin-bottom: 12px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.stats {
  font-weight: 500;
  font-size: 13px;
  color: #667;
}
.type-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.type-switch button {
  height: 40px;
  border: 1px solid #d7dbe6;
  border-radius: 10px;
  background: #fafbfe;
  cursor: pointer;
  font: inherit;
}
.type-switch button.on {
  border-color: var(--party, #a11);
  background: #fff5f5;
  color: var(--party, #a11);
  font-weight: 700;
}
.type-switch button:not(.party).on {
  border-color: #1d4f91;
  background: #eef4fb;
  color: #1d4f91;
}
.uploads {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.file-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px dashed #c9ceda;
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  background: #fafbfe;
}
.file-card span {
  font-weight: 600;
  font-size: 14px;
}
.file-card em {
  font-style: normal;
  font-size: 12px;
  color: #667;
  word-break: break-all;
}
.batch-actions {
  display: flex;
  gap: 14px;
  margin-bottom: 10px;
}
.meeting-card {
  border: 1px solid #e6e8ee;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  background: #fcfcfd;
}
.meeting-card.on {
  border-color: #c5d4ea;
  background: #fff;
}
.meeting-card.warn:not(.on) {
  opacity: 0.92;
}
.meeting-check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  cursor: pointer;
}
.meeting-check input {
  margin-top: 4px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: #667;
  align-items: center;
}
.meeting-body {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e6e8ee;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
  margin: 8px 0 12px;
}
.form-grid label,
.topic-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-grid span,
.block-title {
  font-size: 13px;
  color: #445;
  font-weight: 600;
}
.block-title {
  margin: 12px 0 8px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.block-title .hint {
  font-weight: 500;
  font-size: 12px;
  color: #889;
}
.topic-head {
  display: flex;
  gap: 10px;
  align-items: center;
}
.topic-head input[type='text'],
.topic-head > input:not([type='checkbox']) {
  flex: 1;
}
.first-topic-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-size: 12px;
  color: #a11;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.form-grid input,
.topic-card input,
.topic-card textarea,
.minutes {
  border: 1px solid #d7dbe6;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.topic-card {
  border: 1px solid #eceff5;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.minutes {
  width: 100%;
  box-sizing: border-box;
}
.expand {
  margin-top: 8px;
}
@media (max-width: 720px) {
  .uploads,
  .form-grid,
  .type-switch {
    grid-template-columns: 1fr;
  }
}
</style>
