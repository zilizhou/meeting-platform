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
        <span class="ui-tag" :class="meeting.canResolve ? 'ok' : 'warn'">
          {{ meeting.canResolve ? '法定人数达标' : '法定人数未达标' }}
        </span>
        <span v-if="meeting.isMajor" class="ui-tag warn">重大 · 2/3 门槛</span>
      </div>
      <h2>{{ meeting.title }}</h2>
      <p>期次 {{ meeting.periodNo || '—' }} · 时间 {{ formatTime(meeting.scheduledAt) || '待定' }}</p>
      <el-alert
        v-if="missingFirstTopic"
        type="error"
        :closable="false"
        show-icon
        style="margin-top: 12px"
        title="本场党组织会议未纳入第一议题（政治理论学习），不能开始会议或签到开会。"
      />
      <div class="nums">
        <div><strong>{{ meeting.actualAttend }}/{{ meeting.shouldAttend }}</strong><span>到会</span></div>
        <div><strong>{{ meeting.topics?.length || 0 }}</strong><span>入会议题</span></div>
        <div><strong>{{ resolvedCount }}</strong><span>已决议</span></div>
      </div>
    </div>

    <div v-if="hasHeroActions" class="detail-actions">
      <button
        v-if="meeting.status === 'SCHEDULED' || meeting.status === 'IN_PROGRESS'"
        class="ui-btn"
        :class="{ party: isParty }"
        type="button"
        @click="checkIn"
      >
        本人签到
      </button>
      <button
        v-if="meeting.status === 'SCHEDULED' || meeting.status === 'IN_PROGRESS'"
        class="ui-btn light"
        type="button"
        @click="openLeave"
      >
        请假报备
      </button>
      <button
        v-if="
          (roles.canCreateMeeting.value ||
            roles.canResolve.value ||
            (isParty && roles.canHostPartyMeeting.value)) &&
          (meeting.status === 'SCHEDULED' || meeting.status === 'DRAFT')
        "
        class="ui-btn"
        :class="{ party: isParty }"
        type="button"
        :disabled="missingFirstTopic"
        @click="start"
      >
        开始会议
      </button>
      <button
        v-if="
          (roles.canCreateMeeting.value ||
            roles.canResolve.value ||
            (isParty && roles.canHostPartyMeeting.value)) &&
          meeting.status === 'IN_PROGRESS'
        "
        class="ui-btn danger"
        type="button"
        @click="endMeeting"
      >
        结束会议
      </button>
      <button
        v-if="
          roles.canProxyCheckin.value &&
          (meeting.status === 'SCHEDULED' || meeting.status === 'IN_PROGRESS')
        "
        class="ui-btn light"
        type="button"
        @click="checkInAll"
      >
        一键全员签到
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

    <div class="panel steps-panel">
      <div class="meeting-flow" :class="{ party: isParty, joint: !isParty }">
        <button
          v-for="(step, i) in flowSteps"
          :key="step.key"
          type="button"
          class="flow-item"
          :class="[flowStepState(i), { clickable: flowStepState(i) !== 'pending' }]"
          :disabled="flowStepState(i) === 'pending'"
          @click="focusStep(i)"
        >
          <div class="flow-rail">
            <span class="flow-node">
              <template v-if="flowStepState(i) === 'done'">✓</template>
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span v-if="i < flowSteps.length - 1" class="flow-connector" />
          </div>
          <div class="flow-body">
            <span class="flow-title flow-title--short">{{ step.short }}</span>
            <span class="flow-title flow-title--full">{{ step.full }}</span>
            <span v-if="flowStepState(i) === 'current'" class="flow-badge">进行中</span>
          </div>
        </button>
      </div>
    </div>

    <div
      v-if="flowGuide"
      class="flow-guide"
      :class="{ party: isParty }"
    >
      <div class="flow-guide-text">
        <strong>{{ flowGuide.title }}</strong>
        <span>{{ flowGuide.desc }}</span>
      </div>
      <button
        v-if="flowGuide.actionLabel"
        class="ui-btn"
        :class="{ party: isParty }"
        type="button"
        @click="onFlowGuideAction"
      >
        {{ flowGuide.actionLabel }}
      </button>
    </div>

    <div id="meeting-flow-checkin" class="panel flow-panel">
      <div class="ui-sec">
        <h3><i :class="{ party: isParty }"></i>参会签到</h3>
        <span class="n">正式 {{ formalChecked }}/{{ formalTotal }} · 列席 {{ attendeeChecked }}/{{ attendeeTotal }}</span>
      </div>
      <el-table :data="meeting.attendances || []" size="small" stripe>
        <el-table-column label="姓名" width="120">
          <template #default="{ row }">{{ row.user?.realName }}</template>
        </el-table-column>
        <el-table-column label="职务" width="140">
          <template #default="{ row }">{{ row.user?.title || '—' }}</template>
        </el-table-column>
        <el-table-column label="身份" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.isFormal ? 'success' : 'info'">
              {{ row.isFormal ? '正式' : '列席' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="签到" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.leaveNote" size="small" type="info">已请假</el-tag>
            <el-tag v-else size="small" :type="row.checkedIn ? 'success' : 'warning'">
              {{ row.checkedIn ? '已签到' : '未签到' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="请假说明" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.leaveNote || '—' }}</template>
        </el-table-column>
        <el-table-column label="签到时间" min-width="160">
          <template #default="{ row }">
            {{ row.checkedAt ? new Date(row.checkedAt).toLocaleString('zh-CN') : '—' }}
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div id="meeting-flow-agenda" class="panel flow-panel">
      <div class="ui-sec">
        <h3><i :class="{ party: isParty }"></i>议程与表决</h3>
        <span class="n">{{ meeting.topics?.length || 0 }} 项 · 赞成门槛 {{ voteThresholdText }}</span>
      </div>

      <el-empty v-if="!meeting.topics?.length" description="暂无入会议题" :image-size="64" />

      <template v-else>
        <div class="ui-filter-wrap">
          <div ref="topicFilterEl" class="ui-filter is-scroll" role="tablist">
            <button
              v-for="(topic, idx) in meeting.topics"
              :key="topic.id"
              type="button"
              role="tab"
              :class="{ on: activeTopicId === topic.id, party: isParty }"
              :aria-selected="activeTopicId === topic.id"
              @click="selectTopic(topic.id)"
            >
              {{ topicTabLabel(topic, idx) }}
            </button>
          </div>
        </div>

        <div v-if="activeTopic" class="topic-card" @click="openTopicDialog">
          <div class="topic-card-top">
            <span class="ui-tag" :class="isParty ? 'party' : 'joint'">
              {{ statusLabel(activeTopic.status) }}
            </span>
            <span
              class="ui-tag"
              :class="voteStats(activeTopic).canPass ? 'ok' : 'warn'"
            >
              {{ voteStats(activeTopic).canPass ? '已达门槛' : '未达门槛' }}
            </span>
            <span v-if="activeTopic.resolution?.resultType" class="ui-tag ok">
              已决议
            </span>
          </div>
          <h4 class="topic-card-title">{{ activeTopic.title }}</h4>
          <div class="topic-card-stats">
            <span>赞成 <b>{{ voteStats(activeTopic).approve }}</b></span>
            <span class="dot">·</span>
            <span>反对 <b>{{ voteStats(activeTopic).reject }}</b></span>
            <span class="dot">·</span>
            <span>未表决 <b>{{ voteStats(activeTopic).pending }}</b></span>
          </div>
          <div class="topic-card-foot" @click.stop>
            <button
              class="ui-btn"
              :class="{ party: isParty }"
              type="button"
              @click="openTopicDialog"
            >
              {{
                meeting.status === 'IN_PROGRESS' || meeting.status === 'SCHEDULED'
                  ? '查看详情与表决'
                  : '查看详情'
              }}
            </button>
            <button
              v-if="
                roles.canResolve.value &&
                (meeting.status === 'IN_PROGRESS' || meeting.status === 'SCHEDULED') &&
                !activeTopic.resolution
              "
              class="ui-btn light"
              type="button"
              @click="resolve(activeTopic.id, false)"
            >
              形成决议
            </button>
          </div>
        </div>
      </template>
    </div>

    <div id="meeting-flow-minutes" class="panel minutes-panel flow-panel">
      <div class="minutes-head">
        <h3>
          <i :class="{ party: isParty }"></i>
          {{ isParty ? '会议纪要' : '会议纪要双签' }}
        </h3>
        <button class="ui-link" type="button" @click="exportMinutesWord">导出 Word</button>
      </div>

      <div v-if="roles.canSaveMinutes.value" class="minutes-quick">
        <button class="ui-btn" type="button" @click="fillMinutesFromAgenda">
          按议程一键成稿
        </button>
        <button
          class="ui-btn light"
          type="button"
          :disabled="minutesAiLoading"
          @click="generateMinutesDraft"
        >
          {{ minutesAiLoading ? 'AI 生成中…' : 'AI 润色生成' }}
        </button>
      </div>
      <p class="minutes-hint">
        先「按议程一键成稿」或「AI 润色」写入下文 → 核对修改 → 保存 →
        {{ isParty ? '书记/副书记' : '书记/院长' }}签署生效。
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

    <el-dialog v-model="leaveVisible" title="会前请假报备" width="480px">
      <el-form label-width="80px">
        <el-form-item label="请假事由">
          <el-input
            v-model="leaveReason"
            type="textarea"
            :rows="3"
            placeholder="须会前向主持人报备并留痕"
          />
        </el-form-item>
      </el-form>
      <div class="hint">说明：请假不影响应到会正式成员基数（法定人数仍按名单计算）。</div>
      <template #footer>
        <el-button @click="leaveVisible = false">取消</el-button>
        <el-button type="primary" @click="submitLeave">提交报备</el-button>
      </template>
    </el-dialog>

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
          <span v-if="dialogTopic.isMajor" class="ui-tag warn">重大</span>
          <span v-if="dialogTopic.isTempMotion" class="ui-tag warn">临时动议</span>
          <span class="muted meta-text">
            {{ dialogTopic.proposer?.realName ? `提出人 ${dialogTopic.proposer.realName}` : '' }}
            <template v-if="dialogTopic.category?.name">
              · {{ dialogTopic.category.name }}
            </template>
          </span>
        </div>

        <div class="vote-grid">
          <div class="vote-cell">
            <strong>{{ voteStats(dialogTopic).approve }}</strong>
            <span>赞成</span>
          </div>
          <div class="vote-cell">
            <strong>{{ voteStats(dialogTopic).reject }}</strong>
            <span>反对</span>
          </div>
          <div class="vote-cell">
            <strong>{{ voteStats(dialogTopic).pending }}</strong>
            <span>未表决</span>
          </div>
          <div class="vote-cell">
            <strong>{{ voteStats(dialogTopic).absent }}</strong>
            <span>缺席意见</span>
          </div>
          <div class="vote-cell">
            <strong>{{ voteStats(dialogTopic).avoid }}</strong>
            <span>回避</span>
          </div>
        </div>
        <div class="vote-threshold">
          <span
            class="ui-tag"
            :class="voteStats(dialogTopic).canPass ? 'ok' : 'warn'"
          >
            {{
              voteStats(dialogTopic).canPass
                ? '已达通过门槛'
                : `未达门槛（需 > ${voteStats(dialogTopic).threshold}）`
            }}
          </span>
          <span class="muted">门槛 {{ voteThresholdText }}</span>
        </div>

        <el-alert
          v-if="meeting.status === 'ENDED'"
          type="info"
          :closable="false"
          show-icon
          title="会议已结束，会中表决与决议已关闭。"
          style="margin-bottom: 12px"
        />

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

        <div class="dialog-section">
          <div class="dialog-label">
            讨论记录 · {{ dialogTopic.discussions?.length || 0 }}
          </div>
          <div v-if="dialogTopic.discussions?.length" class="discuss-list">
            <div v-for="d in dialogTopic.discussions" :key="d.id" class="discuss-item">
              <el-tag size="small" :type="d.isFinal ? 'warning' : 'info'">
                {{ d.isFinal ? '最后表态' : '发言' }}
              </el-tag>
              <span>
                <b v-if="d.user?.realName">{{ d.user.realName }}</b>
                {{ d.opinion }}
              </span>
              <span v-if="d.reason" class="muted"> · {{ d.reason }}</span>
            </div>
          </div>
          <div v-else class="muted">暂无讨论记录</div>
        </div>

        <div class="dialog-section">
          <div class="dialog-label">决议</div>
          <div class="dialog-content">
            <template v-if="dialogTopic.resolution">
              {{ dialogTopic.resolution.resultType }}
              · {{ dialogTopic.resolution.content || '—' }}
            </template>
            <template v-else>尚未形成决议 · 赞成门槛 {{ voteThresholdText }}</template>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="dialog-footer-actions">
          <template
            v-if="
              dialogTopic &&
              (meeting.status === 'IN_PROGRESS' || meeting.status === 'SCHEDULED')
            "
          >
            <button
              class="ui-btn"
              :class="{ party: isParty }"
              type="button"
              @click="vote(dialogTopic.id, true)"
            >
              赞成
            </button>
            <button
              class="ui-btn light"
              type="button"
              @click="vote(dialogTopic.id, false)"
            >
              反对
            </button>
          </template>
          <button class="ui-btn light" type="button" @click="topicDialogVisible = false">
            关闭
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'
import { exportMeetingMinutesDoc } from '@/utils/exportMinutesDoc'
import {
  MEETING_FLOW_STEPS,
  deriveMeetingFlowStep,
  meetingFlowPanelId,
  meetingFlowState,
  type MeetingFlowStep,
} from '@/utils/meetingFlow'

const route = useRoute()
const router = useRouter()
const roles = useRoles()
const meeting = ref<any>(null)
const didInitialFocus = ref(false)
const minutesContent = ref('')
const minutesDraft = ref<any>(null)
const minutesDraftText = ref('')
const minutesAiLoading = ref(false)
const leaveVisible = ref(false)
const leaveReason = ref('')
const activeTopicId = ref('')
const topicDialogVisible = ref(false)
const topicDetailLoading = ref(false)
const topicDetailExtra = ref<any>(null)
const topicFilterEl = ref<HTMLElement | null>(null)

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

function topicTabLabel(topic: any, idx: string | number) {
  const title = String(topic.title || '')
  if (title.length <= 8) return title
  return `议题${Number(idx) + 1}`
}

function selectTopic(id: string) {
  activeTopicId.value = id
}

async function openTopicDialog() {
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

watch(activeTopicId, () => {
  nextTick(() => {
    topicFilterEl.value?.querySelector('button.on')?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  })
})

const isParty = computed(() => meeting.value?.meetingType === 'PARTY_COMMITTEE')
const missingFirstTopic = computed(() => {
  if (!isParty.value) return false
  const topics = meeting.value?.topics || []
  return !topics.some((t: any) => t.category?.code === 'FIRST_TOPIC')
})
const voteThresholdText = computed(() =>
  meeting.value?.isMajor ? '超过应到 2/3' : '超过应到 1/2',
)
const resolvedCount = computed(
  () => (meeting.value?.topics || []).filter((t: any) => t.resolution).length,
)

function formatTime(v?: string) {
  if (!v) return ''
  return new Date(v).toLocaleString('zh-CN')
}

const formalTotal = computed(
  () => (meeting.value?.attendances || []).filter((a: any) => a.isFormal).length,
)
const formalChecked = computed(
  () =>
    (meeting.value?.attendances || []).filter((a: any) => a.isFormal && a.checkedIn)
      .length,
)
const attendeeTotal = computed(
  () => (meeting.value?.attendances || []).filter((a: any) => !a.isFormal).length,
)
const attendeeChecked = computed(
  () =>
    (meeting.value?.attendances || []).filter((a: any) => !a.isFormal && a.checkedIn)
      .length,
)

const flow = computed(() => deriveMeetingFlowStep(meeting.value))

const flowSteps = computed(() =>
  MEETING_FLOW_STEPS.map((s) => ({
    ...s,
    full:
      s.key === 'minutes'
        ? isParty.value
          ? '书记/副书记签纪要'
          : '双签纪要'
        : s.full,
  })),
)

function flowStepState(index: number) {
  return meetingFlowState(index, flow.value)
}

const flowGuide = computed(() => {
  const f = flow.value
  if (!meeting.value || f.allDone) return null
  return {
    title: `当前步骤：${f.label}`,
    desc: f.nextLabel ? `完成后进入「${f.nextLabel}」` : '请完成本步后继续',
    actionLabel: '前往当前步骤',
    targetIndex: f.index,
  }
})

function onFlowGuideAction() {
  if (flowGuide.value) focusStep(flowGuide.value.targetIndex)
}

function focusStep(index: number, opts?: { smooth?: boolean }) {
  const state = flowStepState(index)
  if (state === 'pending' && !flow.value.allDone) return
  scrollToFlowPanel(index, opts)
  const step = String(index + 1)
  if (String(route.query.step || '') !== step) {
    router.replace({
      query: { ...route.query, step },
    })
  }
}

async function focusCurrentStep(opts?: { smooth?: boolean }) {
  await nextTick()
  const f = flow.value
  focusStep(f.allDone ? 3 : f.index, opts)
}

/** 步骤推进后提示并跳到新当前步 */
async function afterFlowAdvance(prev: MeetingFlowStep, successMsg: string) {
  await load({ skipAutoFocus: true })
  const next = flow.value
  if (next.allDone) {
    ElMessage.success(successMsg)
    await focusCurrentStep()
    return
  }
  if (next.index > prev.index || next.key !== prev.key) {
    ElMessage.success(`${successMsg}。下一步：${next.label}`)
    await focusCurrentStep()
    return
  }
  ElMessage.success(successMsg)
}

const hasHeroActions = computed(() => {
  const m = meeting.value
  if (!m) return false
  const inMeet = m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS'
  if (inMeet) return true
  const canHost =
    roles.canCreateMeeting.value ||
    roles.canResolve.value ||
    (isParty.value && roles.canHostPartyMeeting.value)
  if (canHost && m.status === 'DRAFT') return true
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

function parseAvoid(topic: any): string[] {
  try {
    return JSON.parse(topic.avoidUserIds || '[]')
  } catch {
    return []
  }
}

function voteStats(topic: any) {
  const avoidIds = parseAvoid(topic)
  const formal = (meeting.value?.attendances || []).filter((a: any) => a.isFormal)
  const should = meeting.value?.shouldAttend || formal.length
  const ratio = meeting.value?.isMajor || topic.isMajor ? 2 / 3 : 1 / 2
  const threshold = Number((should * ratio).toFixed(2))
  const counted = (topic.votes || []).filter(
    (v: any) => v.voteCounted && !v.isAbsentOpinion,
  )
  const absent = (topic.votes || []).filter((v: any) => v.isAbsentOpinion).length
  const approve = counted.filter((v: any) => v.approve).length
  const reject = counted.filter((v: any) => v.approve === false).length
  const votedUserIds = new Set(
    counted.map((v: any) => v.userId).filter(Boolean),
  )
  const pending = formal.filter(
    (a: any) =>
      a.checkedIn &&
      !avoidIds.includes(a.userId) &&
      !votedUserIds.has(a.userId),
  ).length
  return {
    approve,
    reject,
    pending,
    absent,
    avoid: avoidIds.length,
    threshold,
    canPass: approve > threshold,
  }
}

function goBack() {
  router.push({
    path: '/meet',
    query: { tab: isParty.value ? 'party' : 'joint' },
  })
}

async function load(opts?: { skipAutoFocus?: boolean }) {
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
  if (meeting.value.meetingType === 'PARTY_COMMITTEE') {
    nextQuery.from = 'party'
  }

  if (!opts?.skipAutoFocus && !didInitialFocus.value) {
    didInitialFocus.value = true
    await nextTick()
    const f = flow.value
    let targetIndex = f.allDone ? 3 : f.index
    const qStep = Number(route.query.step)
    if (!f.allDone && Number.isFinite(qStep) && qStep >= 1 && qStep <= 4) {
      const idx = qStep - 1
      if (meetingFlowState(idx, f) !== 'pending') targetIndex = idx
    }
    nextQuery.step = String(targetIndex + 1)
    scrollToFlowPanel(targetIndex, { smooth: false })
  } else if (didInitialFocus.value && !nextQuery.step) {
    nextQuery.step = String((flow.value.allDone ? 3 : flow.value.index) + 1)
  }

  const sameQuery =
    String(route.query.from || '') === String(nextQuery.from || '') &&
    String(route.query.step || '') === String(nextQuery.step || '')
  if (!sameQuery) {
    router.replace({ query: nextQuery })
  }
}

function scrollToFlowPanel(index: number, opts?: { smooth?: boolean }) {
  const id = meetingFlowPanelId(index)
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({
    behavior: opts?.smooth === false ? 'auto' : 'smooth',
    block: 'start',
  })
  el.classList.remove('flow-panel--flash')
  void el.offsetWidth
  el.classList.add('flow-panel--flash')
  window.setTimeout(() => el.classList.remove('flow-panel--flash'), 1600)
}

function resolutionLabel(resultType?: string) {
  const map: Record<string, string> = {
    APPROVED: '通过',
    PRINCIPLE_APPROVED: '原则通过',
    DEFERRED: '暂缓',
    REJECTED: '未通过',
  }
  return map[resultType || ''] || resultType || '待决议'
}

function buildMinutesOutline(m: any = meeting.value) {
  if (!m) return ''
  const formalIn = (m.attendances || []).filter((a: any) => a.isFormal && a.checkedIn)
  const leave = (m.attendances || []).filter((a: any) => a.isFormal && a.leaveNote)
  const lines: string[] = [
    `${m.title}纪要`,
    '',
    `会议时间：${formatTime(m.scheduledAt)}`,
    `期次：${m.periodNo || '—'}`,
    `出席：${formalIn.map((a: any) => a.user?.realName).filter(Boolean).join('、') || '—'}`,
  ]
  if (leave.length) {
    lines.push(
      `请假：${leave.map((a: any) => `${a.user?.realName || ''}（${a.leaveNote}）`).join('；')}`,
    )
  }
  lines.push('', '议定事项：')
  const topics = m.topics || []
  if (!topics.length) {
    lines.push('（暂无入会议题）')
  } else {
    topics.forEach((t: any, i: number) => {
      lines.push(`${i + 1}. ${t.title}`)
      if (t.resolution) {
        const body = t.resolution.content ? `。${t.resolution.content}` : ''
        lines.push(`   决议：${resolutionLabel(t.resolution.resultType)}${body}`)
      } else {
        lines.push('   决议：（待形成）')
      }
    })
  }
  lines.push('', '主持人：', '记录人：')
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

async function start() {
  try {
    const prev = flow.value
    await http.post(`/meetings/${route.params.id}/start`)
    await afterFlowAdvance(prev, '会议已开始')
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function endMeeting() {
  try {
    await ElMessageBox.confirm(
      '结束后将关闭签到、讨论、表决与形成决议；可继续起草并签署纪要。确认结束会议？',
      '结束会议',
      { type: 'warning', confirmButtonText: '结束会议', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    const prev = flow.value
    await http.post(`/meetings/${route.params.id}/end`)
    await afterFlowAdvance(prev, '会议已结束，请起草并签署纪要')
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function checkIn() {
  try {
    const prev = flow.value
    await http.post(`/meetings/${route.params.id}/checkin`, {})
    await afterFlowAdvance(prev, '签到成功')
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

function openLeave() {
  leaveReason.value = ''
  leaveVisible.value = true
}

async function submitLeave() {
  if (!leaveReason.value.trim()) {
    ElMessage.warning('请填写请假事由')
    return
  }
  try {
    await http.post(`/meetings/${route.params.id}/leave`, {
      reason: leaveReason.value.trim(),
    })
    ElMessage.success('请假已报备')
    leaveVisible.value = false
    await load()
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

async function checkInAll() {
  try {
    const prev = flow.value
    for (const a of meeting.value.attendances || []) {
      if (!a.checkedIn) {
        await http.post(`/meetings/${route.params.id}/checkin`, { userId: a.userId })
      }
    }
    await afterFlowAdvance(prev, '全员已签到')
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function discuss(topicId: string, opinion: string, isFinal: boolean) {
  try {
    await http.post(`/meetings/${route.params.id}/topics/${topicId}/discuss`, {
      opinion,
      reason: isFinal ? '主要负责人最后表态：同意按议案办理' : '同意按议案办理',
      isFinal,
    })
    ElMessage.success(isFinal ? '最后表态已记录' : '发言已记录')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function vote(topicId: string, approve: boolean) {
  try {
    await http.post(`/meetings/${route.params.id}/topics/${topicId}/vote`, {
      method: 'HAND',
      approve,
    })
    ElMessage.success('表决已记录')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function absentOpinion(topicId: string) {
  try {
    const { value } = await ElMessageBox.prompt(
      '缺席书面意见不计票。请填写意见说明',
      '缺席书面意见',
      { inputPlaceholder: '缺席事由或意见说明' },
    )
    const approve = await ElMessageBox.confirm('是否登记为赞成意见？', '意见类型', {
      confirmButtonText: '赞成',
      cancelButtonText: '反对',
      distinguishCancelAndClose: true,
    })
      .then(() => true)
      .catch((action: string) => {
        if (action === 'cancel') return false
        throw action
      })
    await http.post(`/meetings/${route.params.id}/topics/${topicId}/absent-opinion`, {
      approve,
      reason: value,
    })
    ElMessage.success('缺席书面意见已登记（不计票）')
    await load()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(String(e))
  }
}

async function voteAll(topicId: string) {
  try {
    const res: any = await http.post(
      `/meetings/${route.params.id}/topics/${topicId}/vote-all-approve`,
    )
    const skip =
      res.skippedAvoid > 0 ? `，跳过回避 ${res.skippedAvoid} 人` : ''
    ElMessage.success(`已代录 ${res.count} 票赞成${skip}`)
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function resolve(topicId: string, transferToJoint: boolean) {
  try {
    const prev = flow.value
    await http.post(`/meetings/${route.params.id}/topics/${topicId}/resolve`, {
      resultType: 'APPROVED',
      content: transferToJoint ? '会议研究通过，转联席会落实' : '会议研究通过',
      transferToJoint,
    })
    await afterFlowAdvance(
      prev,
      transferToJoint ? '决议已形成并转联席会' : '决议已形成，督办已生成',
    )
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function saveMinutes() {
  try {
    const prev = flow.value
    await http.post(`/meetings/${route.params.id}/minutes`, { content: minutesContent.value })
    await afterFlowAdvance(prev, '纪要已保存，已通知签署人')
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function signMinutes() {
  try {
    const prev = flow.value
    await http.post(`/meetings/${route.params.id}/minutes/sign`)
    await afterFlowAdvance(prev, '签署成功')
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

onMounted(load)

watch(
  () => route.params.id,
  (id, prev) => {
    if (id && id !== prev) {
      didInitialFocus.value = false
      load()
    }
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
.steps-panel {
  padding: 16px;
}
.meeting-flow {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.flow-item {
  display: flex;
  gap: 12px;
  align-items: stretch;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
}
.flow-item.clickable {
  cursor: pointer;
}
.flow-item.clickable:hover .flow-title {
  color: var(--joint);
}
.detail.party .flow-item.clickable:hover .flow-title {
  color: var(--party);
}
.flow-item:disabled {
  cursor: default;
  opacity: 1;
}
.flow-guide {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -4px 0 14px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #d6e4f5;
  background: linear-gradient(180deg, #f5f9ff 0%, #eef5fc 100%);
}
.flow-guide.party {
  border-color: #ecd6d6;
  background: linear-gradient(180deg, #fff8f8 0%, #faf0f0 100%);
}
.flow-guide-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.flow-guide-text strong {
  font-size: 14px;
  font-family: var(--font-serif);
  color: var(--text);
}
.flow-guide-text span {
  font-size: 12px;
  color: var(--muted);
}
.flow-panel {
  scroll-margin-top: 12px;
  transition: box-shadow 0.35s ease, border-color 0.35s ease;
}
.flow-panel--flash {
  border-color: var(--joint) !important;
  box-shadow: 0 0 0 3px rgba(61, 127, 212, 0.18);
}
.detail.party .flow-panel--flash {
  border-color: var(--party) !important;
  box-shadow: 0 0 0 3px rgba(196, 90, 90, 0.18);
}
.flow-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 28px;
  flex-shrink: 0;
}
.flow-node {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  background: #eef1f5;
  color: #8a94a6;
  border: 2px solid #dde3eb;
}
.flow-connector {
  flex: 1;
  width: 2px;
  min-height: 12px;
  margin: 4px 0;
  background: #dde3eb;
  border-radius: 1px;
}
.flow-item.done .flow-node {
  background: #e6f4ec;
  color: var(--ok);
  border-color: #b8dfc9;
}
.flow-item.done .flow-connector {
  background: #b8dfc9;
}
.flow-item.current .flow-node {
  background: var(--joint-soft);
  color: var(--joint);
  border-color: var(--joint);
}
.meeting-flow.party .flow-item.current .flow-node {
  background: var(--party-soft);
  color: var(--party);
  border-color: var(--party);
}
.flow-body {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  padding: 4px 0 14px;
  min-height: 28px;
}
.flow-item:last-child .flow-body {
  padding-bottom: 0;
}
.flow-title {
  font-size: 14px;
  line-height: 1.35;
  color: #5c6573;
}
.flow-item.done .flow-title {
  color: var(--ok);
  font-weight: 600;
}
.flow-item.current .flow-title {
  color: #1a2233;
  font-weight: 700;
}
.flow-title--short {
  display: none;
}
.flow-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--joint-soft);
  color: var(--joint);
}
.meeting-flow.party .flow-badge {
  background: var(--party-soft);
  color: var(--party);
}
@media (min-width: 768px) {
  .meeting-flow {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    position: relative;
    padding-top: 4px;
  }
  .meeting-flow::before {
    content: '';
    position: absolute;
    top: 17px;
    left: 14px;
    right: 14px;
    height: 2px;
    background: #dde3eb;
    z-index: 0;
  }
  .flow-item {
    flex: 1;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    position: relative;
    z-index: 1;
    min-width: 0;
  }
  .flow-rail {
    width: auto;
  }
  .flow-connector {
    display: none;
  }
  .flow-body {
    flex-direction: column;
    align-items: center;
    padding: 0;
    text-align: center;
    width: 100%;
  }
  .flow-title--short {
    display: block;
    font-size: 13px;
  }
  .flow-title--full {
    display: none;
  }
  .flow-badge {
    margin-top: 2px;
  }
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
.topic-card {
  margin-top: 12px;
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
}
.topic-card-stats b {
  color: var(--text);
  font-weight: 700;
}
.topic-card-stats .dot {
  color: #c5ccd6;
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
