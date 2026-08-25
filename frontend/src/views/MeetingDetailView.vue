<template>
  <div v-if="meeting" class="detail" :class="{ party: isParty }">
    <button class="app-back detail-back" type="button" @click="goBack">‹ 返回列表</button>

    <div class="ui-hero" :class="{ party: isParty, joint: !isParty }">
      <div class="eyebrow">
        <b></b> {{ isParty ? '党委红轨' : '联席蓝轨' }} · 会议详情
      </div>
      <div class="hero-tags">
        <span class="ui-tag" :class="isParty ? 'party' : 'joint'">
          {{ isParty ? '党组织会议' : '党政联席会' }}
        </span>
        <span class="ui-tag hero-status">{{ statusLabel(meeting.status) }}</span>
        <span v-if="meeting.isMajor" class="ui-tag warn">重大事项</span>
      </div>
      <h2>{{ meeting.title }}</h2>
      <p>期次 {{ meeting.periodNo || '—' }} · 时间 {{ formatTime(meeting.scheduledAt) || '待定' }}</p>
      <el-alert
        v-if="missingFirstTopic"
        type="error"
        :closable="false"
        show-icon
        style="margin-top: 12px"
        title="本场党组织会议未纳入第一议题（政治理论学习），不能标记已召开。"
      />
      <div class="nums">
        <div><strong>{{ meeting.topics?.length || 0 }}</strong><span>入会议题</span></div>
      </div>
    </div>

    <div v-if="hasHeroActions" class="detail-actions">
      <button
        v-if="
          (roles.canCreateMeeting.value ||
            roles.canResolve.value ||
            (isParty && roles.canHostPartyMeeting.value)) &&
          (meeting.status === 'SCHEDULED' ||
            meeting.status === 'DRAFT' ||
            meeting.status === 'IN_PROGRESS')
        "
        class="ui-btn"
        :class="{ party: isParty }"
        type="button"
        :disabled="missingFirstTopic"
        @click="markHeld"
      >
        标记已召开
      </button>
      <button
        v-if="roles.canCreateMeeting.value && meeting.status === 'RESOLVED'"
        class="ui-btn light"
        type="button"
        @click="archive"
      >
        归档
      </button>
    </div>

    <div class="panel">
      <div class="ui-sec">
        <h3><i :class="{ party: isParty }"></i>入会议题</h3>
        <span class="n">{{ meeting.topics?.length || 0 }} 项</span>
      </div>

      <el-empty v-if="!meeting.topics?.length" description="暂无入会议题" :image-size="64" />

      <div v-else class="topic-list">
        <div
          v-for="(topic, idx) in meeting.topics"
          :key="topic.id"
          class="topic-card"
          @click="openTopicDialog(topic.id)"
        >
          <div class="topic-card-top">
            <span class="ui-tag" :class="isParty ? 'party' : 'joint'">
              议题{{ idx + 1 }}
            </span>
            <span class="ui-tag" :class="isParty ? 'party' : 'joint'">
              {{ statusLabel(topic.status) }}
            </span>
            <span v-if="topic.category?.code === 'FIRST_TOPIC'" class="ui-tag party">
              第一议题
            </span>
          </div>
          <h4 class="topic-card-title">{{ topic.title }}</h4>
          <p v-if="topic.content" class="topic-card-stats">{{ topic.content }}</p>
          <div class="topic-card-foot" @click.stop>
            <button
              class="ui-btn"
              :class="{ party: isParty }"
              type="button"
              @click="openTopicDialog(topic.id)"
            >
              查看详情
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel minutes-panel">
      <div class="minutes-head">
        <h3>
          <i :class="{ party: isParty }"></i>
          {{ isParty ? '会议纪要' : '会议纪要双签' }}
        </h3>
        <button class="ui-link" type="button" @click="exportMinutesWord">导出 Word</button>
      </div>

      <div v-if="roles.canSaveMinutes.value" class="minutes-quick">
        <button class="ui-btn" type="button" @click="fillMinutesFromAgenda">
          按议题一键成稿
        </button>
        <button
          class="ui-btn light"
          type="button"
          :disabled="minutesAiLoading"
          @click="generateMinutesDraft"
        >
          {{ minutesAiLoading ? 'AI 生成中…' : 'AI 润色生成' }}
        </button>
        <label class="ui-btn light minutes-upload">
          {{ minutesUploading ? '上传中…' : '上传线下纪要' }}
          <input
            type="file"
            hidden
            accept=".doc,.docx,.pdf,.txt"
            :disabled="minutesUploading"
            @change="onMinutesFile"
          />
        </label>
      </div>
      <p class="minutes-hint">
        可在系统内编辑正文，也可上传线下已签纪要（Word / PDF）。核对后保存 →
        {{ isParty ? '书记/副书记' : '书记/院长' }}签署生效。
      </p>
      <p v-if="meeting.minutes?.originalName" class="minutes-file">
        已上传：{{ meeting.minutes.originalName }}
        <button class="ui-link" type="button" @click="downloadMinutesFile">下载附件</button>
      </p>

      <el-input
        v-model="minutesContent"
        class="minutes-editor"
        type="textarea"
        :rows="10"
        placeholder="纪要正文将显示在这里，可直接编辑"
        :disabled="!roles.canSaveMinutes.value && !meeting.minutes"
      />

      <div class="minutes-foot">
        <span class="meta">
          签署 {{ meeting.minutes?.signs?.map((s: any) => s.side).join('、') || '未签' }}
          · 生效 {{ meeting.minutes?.effectiveAt || '未生效' }}
        </span>
        <div class="minutes-foot-actions">
          <button
            v-if="roles.canSaveMinutes.value"
            class="ui-btn light"
            type="button"
            @click="saveMinutes"
          >
            保存
          </button>
          <button
            v-if="isParty ? roles.canSignPartyMinutes.value : roles.canSignMinutes.value"
            class="ui-btn"
            type="button"
            @click="signMinutes"
          >
            {{ isParty ? '书记签署生效' : '双签生效' }}
          </button>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="topicDialogVisible"
      title="议题详情"
      width="680px"
      class="topic-dialog"
      align-center
      destroy-on-close
      append-to-body
    >
      <template v-if="dialogTopic">
        <h3 class="dialog-topic-title">{{ dialogTopic.title }}</h3>
        <div class="dialog-meta">
          <span class="ui-tag" :class="isParty ? 'party' : 'joint'">
            {{ statusLabel(dialogTopic.status) }}
          </span>
          <span v-if="dialogTopic.category?.code === 'FIRST_TOPIC'" class="ui-tag party">
            第一议题
          </span>
          <span v-if="dialogTopic.isMajor" class="ui-tag warn">重大</span>
          <span v-if="dialogTopic.isTempMotion" class="ui-tag warn">临时动议</span>
          <span class="muted meta-text">
            {{ dialogTopic.proposer?.realName ? `提出人 ${dialogTopic.proposer.realName}` : '' }}
            <template v-if="dialogTopic.category?.name">
              · {{ dialogTopic.category.name }}
            </template>
          </span>
        </div>

        <div class="dialog-section">
          <div class="dialog-label">议题正文</div>
          <div class="dialog-content">
            {{ dialogTopic.content?.trim() || '（暂无议题正文）' }}
          </div>
        </div>

        <div class="dialog-section">
          <div class="dialog-label">基本信息</div>
          <div class="info-list">
            <div><em>会议类型</em><span>{{ isParty ? '党组织会议' : '党政联席会' }}</span></div>
            <div><em>重大事项</em><span>{{ dialogTopic.isMajor ? '是' : '否' }}</span></div>
            <div><em>临时动议</em><span>{{ dialogTopic.isTempMotion ? '是' : '否' }}</span></div>
            <div v-if="!isParty">
              <em>党组织会议前置</em>
              <span>{{ dialogTopic.needPartyPrecheck ? '需要' : '不需要' }}</span>
            </div>
          </div>
        </div>

        <div class="dialog-section">
          <div class="dialog-label">{{ isParty ? '书记审题' : '双审进度' }}</div>
          <div v-if="dialogReviews.length" class="review-list">
            <div v-for="r in dialogReviews" :key="r.key" class="review-item">
              <span class="review-side">{{ r.label }}</span>
              <span class="ui-tag" :class="r.ok ? 'ok' : 'warn'">{{ r.decision }}</span>
              <span v-if="r.meta" class="muted">{{ r.meta }}</span>
            </div>
          </div>
          <div v-else class="muted">
            {{ isParty ? '尚未提交书记审题' : '尚未提交双审' }}
          </div>
        </div>

        <div class="dialog-section">
          <div class="dialog-label">
            会前材料
            <span v-if="dialogMaterials.length" class="n">
              {{ dialogMaterials.filter((m: any) => m.uploaded).length }}/{{ dialogMaterials.length }}
            </span>
          </div>
          <div v-if="dialogMaterials.length" class="material-list">
            <div v-for="m in dialogMaterials" :key="m.id" class="material-item">
              <span>{{ m.name }}</span>
              <span class="ui-tag" :class="m.uploaded ? 'ok' : 'warn'">
                {{ m.uploaded ? '已上传' : '未上传' }}
              </span>
            </div>
          </div>
          <div v-else class="muted">{{ topicDetailLoading ? '加载中…' : '暂无材料' }}</div>
        </div>
      </template>
      <template #footer>
        <div class="dialog-footer-actions">
          <button class="ui-btn light" type="button" @click="topicDialogVisible = false">
            关闭
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'
import { exportMeetingMinutesDoc } from '@/utils/exportMinutesDoc'

const route = useRoute()
const router = useRouter()
const roles = useRoles()
const meeting = ref<any>(null)
const minutesContent = ref('')
const minutesDraft = ref<any>(null)
const minutesDraftText = ref('')
const minutesAiLoading = ref(false)
const minutesUploading = ref(false)
const activeTopicId = ref('')
const topicDialogVisible = ref(false)
const topicDetailLoading = ref(false)
const topicDetailExtra = ref<any>(null)

const activeTopic = computed(() =>
  (meeting.value?.topics || []).find((t: any) => t.id === activeTopicId.value),
)

/** 会议现场实时数据 + 议题完整详情 */
const dialogTopic = computed(() => {
  const live = activeTopic.value
  if (!live) return null
  const extra = topicDetailExtra.value
  if (!extra || extra.id !== live.id) return live
  return {
    ...extra,
    ...live,
    content: live.content ?? extra.content,
    proposer: live.proposer || extra.proposer,
    category: live.category || extra.category,
    jointReviews: extra.jointReviews || live.jointReviews,
    materials: extra.materials?.length ? extra.materials : live.materials || [],
  }
})

const dialogMaterials = computed(() => dialogTopic.value?.materials || [])

const dialogReviews = computed(() => {
  const reviews = dialogTopic.value?.jointReviews || []
  if (!reviews.length) return []
  if (isParty.value) {
    const r = reviews[0]
    return [
      {
        key: 'secretary',
        label: '书记审',
        decision: decisionLabel(r?.decision),
        ok: r?.decision === 'APPROVED',
        meta: [r?.reviewer?.realName, r?.comment].filter(Boolean).join(' · '),
      },
    ]
  }
  const sides = [
    { key: 'SECRETARY', label: '书记审' },
    { key: 'DEAN', label: '院长审' },
  ]
  return sides.map((s) => {
    const r = reviews.find((x: any) => x.side === s.key)
    return {
      key: s.key,
      label: s.label,
      decision: decisionLabel(r?.decision),
      ok: r?.decision === 'APPROVED',
      meta: [r?.reviewer?.realName, r?.comment].filter(Boolean).join(' · '),
    }
  })
})

function decisionLabel(d?: string) {
  if (d === 'APPROVED') return '同意'
  if (d === 'REJECTED') return '暂缓'
  return '待审'
}

async function openTopicDialog(topicId?: string) {
  if (topicId) activeTopicId.value = topicId
  if (!activeTopicId.value) return
  topicDialogVisible.value = true
  await loadTopicDetailExtra()
}

async function loadTopicDetailExtra() {
  const id = activeTopicId.value
  if (!id) return
  topicDetailLoading.value = true
  try {
    topicDetailExtra.value = await http.get(`/topics/${id}`)
  } catch {
    topicDetailExtra.value = null
  } finally {
    topicDetailLoading.value = false
  }
}

function exportMinutesWord() {
  if (!meeting.value) return
  exportMeetingMinutesDoc({
    ...meeting.value,
    minutes: meeting.value.minutes
      ? {
          ...meeting.value.minutes,
          content: minutesContent.value || meeting.value.minutes.content,
        }
      : { content: minutesContent.value },
  })
  ElMessage.success('纪要 Word 已开始下载')
}

const isParty = computed(() => meeting.value?.meetingType === 'PARTY_COMMITTEE')
const missingFirstTopic = computed(() => {
  if (!isParty.value) return false
  const topics = meeting.value?.topics || []
  return !topics.some((t: any) => t.category?.code === 'FIRST_TOPIC')
})

function formatTime(v?: string) {
  if (!v) return ''
  return new Date(v).toLocaleString('zh-CN')
}

async function reloadWithMessage(successMsg: string) {
  await load()
  ElMessage.success(successMsg)
}

const hasHeroActions = computed(() => {
  const m = meeting.value
  if (!m) return false
  const canHost =
    roles.canCreateMeeting.value ||
    roles.canResolve.value ||
    (isParty.value && roles.canHostPartyMeeting.value)
  if (
    canHost &&
    (m.status === 'DRAFT' || m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS')
  ) {
    return true
  }
  if (roles.canCreateMeeting.value && m.status === 'RESOLVED') return true
  return false
})

const STATUS_MAP: Record<string, string> = {
  DRAFT: '草稿',
  SCHEDULED: '已排期',
  IN_PROGRESS: '进行中',
  ENDED: '已结束',
  RESOLVED: '已决议',
  ARCHIVED: '已归档',
  APPROVED: '已通过',
  ON_AGENDA: '已入议程',
  DISCUSSED: '已讨论',
  REJECTED: '未通过',
  PENDING_REVIEW: '待审',
  DEFERRED: '已暂缓',
}

function statusLabel(s: string) {
  return STATUS_MAP[s] || s
}

function goBack() {
  router.push({
    path: '/meet',
    query: { tab: isParty.value ? 'party' : 'joint' },
  })
}

async function load() {
  meeting.value = await http.get(`/meetings/${route.params.id}`)
  const topics = meeting.value?.topics || []
  if (!topics.some((t: any) => t.id === activeTopicId.value)) {
    activeTopicId.value = topics[0]?.id || ''
  }
  if (topicDialogVisible.value && activeTopicId.value) {
    loadTopicDetailExtra()
  }
  minutesContent.value =
    meeting.value.minutes?.content || buildMinutesOutline(meeting.value)
  try {
    const latest: any = await http.get(
      `/ai/meetings/${route.params.id}/minutes-draft`,
    )
    minutesDraft.value = latest?.draft || null
    minutesDraftText.value = latest?.draft?.outputText || ''
  } catch {
    minutesDraft.value = null
    minutesDraftText.value = ''
  }

  const nextQuery: Record<string, any> = { ...route.query }
  delete nextQuery.step
  if (meeting.value.meetingType === 'PARTY_COMMITTEE') {
    nextQuery.from = 'party'
  }

  const sameQuery =
    String(route.query.from || '') === String(nextQuery.from || '') &&
    String(route.query.step || '') === String(nextQuery.step || '')
  if (!sameQuery) {
    router.replace({ query: nextQuery })
  }
}

function buildMinutesOutline(m: any = meeting.value) {
  if (!m) return ''
  const lines: string[] = [
    `${m.title}纪要`,
    '',
    `会议时间：${formatTime(m.scheduledAt)}`,
    `期次：${m.periodNo || '—'}`,
    '',
    '入会议题：',
  ]
  const topics = m.topics || []
  if (!topics.length) {
    lines.push('（暂无入会议题）')
  } else {
    topics.forEach((t: any, i: number) => {
      lines.push(`${i + 1}. ${t.title}`)
    })
  }
  lines.push('', '议定事项：', '', '主持人：', '记录人：')
  return lines.join('\n')
}

function isBlankOrOutlineMinutes(text: string) {
  const t = text.trim()
  if (!t) return true
  const outline = buildMinutesOutline().trim()
  if (t === outline) return true
  const title = meeting.value?.title || ''
  return t === `${title}纪要\n按议事规则逐项议决。` || t === `${title}纪要`
}

async function applyTextToMinutes(text: string, source: 'agenda' | 'ai') {
  const next = text.trim()
  if (!next) {
    ElMessage.warning(source === 'ai' ? '生成结果为空' : '暂无可写入内容')
    return
  }
  if (!isBlankOrOutlineMinutes(minutesContent.value)) {
    try {
      await ElMessageBox.confirm(
        source === 'ai'
          ? '当前正文已有内容，是否用 AI 稿覆盖？'
          : '当前正文已有内容，是否用议程成稿覆盖？',
        '写入正文',
        { type: 'warning', confirmButtonText: '覆盖写入', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  minutesContent.value = next
  ElMessage.success(
    source === 'ai'
      ? '已写入正文，请核对后点「保存」再签署'
      : '已按议程写入正文，请核对补充后保存',
  )
}

async function fillMinutesFromAgenda() {
  await applyTextToMinutes(buildMinutesOutline(), 'agenda')
}

async function generateMinutesDraft() {
  minutesAiLoading.value = true
  try {
    minutesDraft.value = await http.post(
      `/ai/meetings/${route.params.id}/minutes-draft`,
    )
    minutesDraftText.value = minutesDraft.value?.outputText || ''
    await applyTextToMinutes(minutesDraftText.value, 'ai')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    minutesAiLoading.value = false
  }
}

async function markHeld() {
  try {
    await ElMessageBox.confirm(
      '确认本场会议已线下召开？确认后可整理并签署纪要。',
      '标记已召开',
      { type: 'warning', confirmButtonText: '已召开', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await http.post(`/meetings/${route.params.id}/end`)
    await reloadWithMessage('已标记召开，请整理纪要')
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function archive() {
  try {
    await http.post(`/meetings/${route.params.id}/archive`)
    ElMessage.success('会议已归档')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function onMinutesFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  minutesUploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    await http.post(`/meetings/${route.params.id}/minutes/upload`, fd, { timeout: 60000 })
    await reloadWithMessage('线下纪要已上传')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    minutesUploading.value = false
  }
}

async function downloadMinutesFile() {
  try {
    const res = await http.get(`/meetings/${route.params.id}/minutes/file`, {
      responseType: 'blob',
    })
    const blob = res instanceof Blob ? res : new Blob([res as any])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = meeting.value?.minutes?.originalName || '会议纪要'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function saveMinutes() {
  try {
    await http.post(`/meetings/${route.params.id}/minutes`, { content: minutesContent.value })
    await reloadWithMessage('纪要已保存，已通知签署人')
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function signMinutes() {
  try {
    await http.post(`/meetings/${route.params.id}/minutes/sign`)
    await reloadWithMessage('签署成功')
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

onMounted(load)

watch(
  () => route.params.id,
  (id, prev) => {
    if (id && id !== prev) load()
  },
)
</script>

<style scoped>
.hero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.ui-hero .hero-status {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
.ui-hero .ui-tag.ok {
  background: rgba(255, 255, 255, 0.9);
  color: var(--ok);
}
.ui-hero .ui-tag.warn {
  background: #fff4e8;
  color: #c27803;
}
.detail-back {
  margin-bottom: 10px;
}
.detail.party .detail-back {
  color: var(--party);
}
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 14px;
}
.detail-actions .ui-btn {
  flex: 1 1 calc(50% - 8px);
  min-width: 120px;
  height: 40px;
  text-align: center;
}
.ui-btn.danger {
  background: var(--party-soft);
  color: var(--party);
  border: 1px solid rgba(122, 69, 72, 0.22);
}
.ui-btn.danger:hover:not(:disabled) {
  background: #e8dcdd;
  color: #654043;
}
@media (min-width: 768px) {
  .detail-actions {
    flex-wrap: nowrap;
  }
  .detail-actions .ui-btn {
    flex: 1 1 0;
    min-width: 0;
  }
}
.panel {
  background: var(--card);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: var(--shadow);
  border: 1px solid var(--line);
}
.ui-sec h3 i.party {
  background: var(--party);
}
.minutes-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.minutes-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  font-family: var(--font-serif);
  display: flex;
  align-items: center;
  gap: 8px;
}
.minutes-head h3 i {
  width: 6px;
  height: 14px;
  border-radius: 3px;
  background: var(--joint);
  display: inline-block;
}
.minutes-head h3 i.party {
  background: var(--party);
}
.minutes-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.minutes-quick .ui-btn {
  height: 36px;
  min-width: 128px;
}
.minutes-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.minutes-file {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text);
}
.minutes-hint {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.minutes-editor {
  margin-bottom: 14px;
}
.minutes-editor :deep(.el-textarea__inner) {
  font-size: 14px;
  line-height: 1.65;
  border-radius: 12px;
}
.minutes-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 4px;
}
.minutes-foot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.minutes-foot .meta {
  font-size: 12px;
  color: var(--muted);
}
.topic-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
.topic-card {
  margin: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.topic-card:hover {
  border-color: rgba(26, 79, 139, 0.28);
  box-shadow: 0 6px 16px rgba(15, 53, 95, 0.06);
}
.detail.party .topic-card:hover {
  border-color: rgba(176, 48, 48, 0.28);
}
.topic-card-top {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.topic-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--text);
}
.topic-card-stats {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  overflow: hidden;
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}
.topic-card-foot {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.topic-card-foot .ui-btn {
  flex: 1;
  height: 38px;
}
.dialog-topic-title {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text);
}
.dialog-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}
.dialog-meta .meta-text {
  font-size: 12px;
  line-height: 1.4;
}
.vote-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}
.vote-cell {
  background: #f5f7fa;
  border-radius: 10px;
  padding: 10px 4px;
  text-align: center;
}
.vote-cell strong {
  display: block;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text);
}
.vote-cell span {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--muted);
}
.vote-threshold {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
}
.dialog-footer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
.dialog-footer-actions .ui-btn {
  min-width: 76px;
  height: 38px;
}
.dialog-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.dialog-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dialog-label .n {
  font-size: 12px;
  font-weight: 600;
  color: var(--joint);
}
.dialog-content {
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
}
.info-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}
.info-list > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.info-list em {
  font-style: normal;
  font-size: 11px;
  color: var(--muted);
}
.review-list,
.material-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.review-item,
.material-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.review-side {
  font-weight: 700;
  min-width: 48px;
}
.ui-tag.ok {
  background: #e6f4ec;
  color: var(--ok);
}
.ui-tag.warn {
  background: #fff4e8;
  color: #c27803;
}
.vote-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 13px;
  color: #334155;
}
.topic-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.meta {
  margin-top: 8px;
  color: var(--muted);
  font-size: 13px;
}
.hint {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.discuss-list {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
}
.discuss-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}
.muted {
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

@media (max-width: 900px) {
  .minutes-quick .ui-btn {
    flex: 1;
  }
  .minutes-foot-actions {
    width: 100%;
    margin-left: 0;
  }
  .minutes-foot-actions .ui-btn {
    flex: 1;
  }
  .topic-card-foot {
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .vote-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .info-list {
    grid-template-columns: 1fr;
  }
  .dialog-footer-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .dialog-footer-actions .ui-btn:last-child {
    grid-column: 1 / -1;
  }
}
</style>
