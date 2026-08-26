<template>
  <div v-if="topic" class="detail" :class="{ party: isParty }">
    <button class="app-back detail-back" type="button" @click="goBack">‹ 返回议题库</button>

    <div class="ui-hero" :class="{ party: isParty, joint: !isParty }">
      <div class="eyebrow">
        <b></b> {{ isParty ? '党委红轨' : '联席蓝轨' }} · 议题详情
      </div>
      <div class="hero-tags">
        <span class="ui-tag" :class="isParty ? 'party' : 'joint'">
          {{ isParty ? '党组织会议' : '党政联席会' }}
        </span>
        <span class="ui-tag">{{ statusLabel(topic.status) }}</span>
        <span v-if="topic.isMajor" class="ui-tag warn">重大事项</span>
        <span v-if="topic.isTempMotion" class="ui-tag warn">临时动议</span>
        <span v-if="topic.isEmergency" class="ui-tag warn">紧急临机</span>
      </div>
      <h2>{{ topic.title }}</h2>
      <p>
        分类 {{ topic.category?.name || '未分类' }}
        · 提出人 {{ topic.proposer?.realName || '—' }}
      </p>
    </div>

    <div class="detail-actions">
      <button class="ui-btn light" type="button" @click="load">刷新</button>
      <template v-if="isParty">
        <button
          v-if="roles.canSubmitReview.value"
          class="ui-btn party"
          type="button"
          :disabled="!canSubmit"
          @click="submitReview"
        >
          提交书记审
        </button>
        <button
          v-if="roles.canReviewParty.value && topic.status === 'PENDING_REVIEW'"
          class="ui-btn party"
          type="button"
          @click="review('APPROVED')"
        >
          {{ roles.isSecretary.value ? '书记同意' : '同意' }}
        </button>
        <button
          v-if="roles.canReviewParty.value && topic.status === 'PENDING_REVIEW'"
          class="ui-btn light"
          type="button"
          @click="review('REJECTED')"
        >
          暂缓
        </button>
        <button
          v-if="roles.canProxyReview.value && topic.status === 'PENDING_REVIEW'"
          class="ui-btn light"
          type="button"
          @click="openProxyReview('APPROVED')"
        >
          代审通过
        </button>
        <button
          v-if="roles.canProxyReview.value && topic.status === 'PENDING_REVIEW'"
          class="ui-btn light"
          type="button"
          @click="openProxyReview('REJECTED')"
        >
          代审退回
        </button>
        <button
          v-if="roles.canPartyResolve.value"
          class="ui-btn party"
          type="button"
          :disabled="!canPartyResolve"
          @click="openPartyResolve"
        >
          形成决议
        </button>
      </template>
      <template v-else>
        <button
          v-if="roles.canSubmitReview.value"
          class="ui-btn"
          type="button"
          :disabled="!canSubmit"
          @click="submitReview"
        >
          提交双审
        </button>
        <button
          v-if="roles.canReviewJoint.value && topic.status === 'PENDING_REVIEW'"
          class="ui-btn"
          type="button"
          @click="review('APPROVED')"
        >
          同意
        </button>
        <button
          v-if="roles.canReviewJoint.value && topic.status === 'PENDING_REVIEW'"
          class="ui-btn light"
          type="button"
          @click="review('REJECTED')"
        >
          暂缓
        </button>
        <button
          v-if="roles.canProxyReview.value && topic.status === 'PENDING_REVIEW'"
          class="ui-btn light"
          type="button"
          @click="openProxyReview('APPROVED')"
        >
          代审通过
        </button>
        <button
          v-if="roles.canProxyReview.value && topic.status === 'PENDING_REVIEW'"
          class="ui-btn light"
          type="button"
          @click="openProxyReview('REJECTED')"
        >
          代审退回
        </button>
      </template>
    </div>

    <el-alert
      v-if="topic.transferFrom"
      type="info"
      :closable="false"
      style="margin-bottom: 16px"
      :title="`本议题由党组织会议转办：${topic.transferFrom.sourceTopic?.title || ''}`"
    />
    <el-alert
      v-if="topic.transferTo"
      type="success"
      :closable="false"
      style="margin-bottom: 16px"
      :title="`已转联席会：${topic.transferTo.targetTopic?.title || ''}`"
    >
      <template #default>
        <el-button
          link
          type="primary"
          @click="$router.push(`/topics/${topic.transferTo.targetTopicId}?from=joint`)"
        >
          查看联席会议题
        </el-button>
      </template>
    </el-alert>

    <div class="grid">
      <el-card shadow="never">
        <template #header>基本信息</template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="标题" :span="2">{{ topic.title }}</el-descriptions-item>
          <el-descriptions-item label="会议类型">
            <el-tag size="small" :type="isParty ? 'warning' : 'primary'">
              {{ isParty ? '党组织会议' : '党政联席会' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag>{{ statusLabel(topic.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="分类">
            {{ topic.category?.name || '—' }}
            <el-tag
              v-if="topic.category?.code === 'FIRST_TOPIC'"
              size="small"
              type="danger"
              style="margin-left: 6px"
            >
              第一议题
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="提出人">{{ topic.proposer?.realName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="重大事项">
            <el-tag size="small" :type="topic.isMajor ? 'danger' : 'info'">
              {{ topic.isMajor ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="临时动议">
            <el-tag size="small" :type="topic.isTempMotion ? 'danger' : 'info'">
              {{ topic.isTempMotion ? '是（须双签同意）' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item v-if="!isParty" label="紧急临机">
            <el-tag size="small" :type="topic.isEmergency ? 'danger' : 'info'">
              {{ topic.isEmergency ? '是（事后补确认）' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item v-if="!isParty" label="党组织会议前置">
            {{ topic.needPartyPrecheck ? '需要' : '不需要' }}
          </el-descriptions-item>
          <el-descriptions-item v-if="!isParty" label="关联决议">
            <template v-if="topic.relatedPartyResolutionId">
              <span>{{ topic.relatedPartyResolutionId }}</span>
              <el-button
                v-if="topic.transferFrom?.sourceTopicId"
                link
                type="primary"
                @click="$router.push(`/topics/${topic.transferFrom.sourceTopicId}?from=party`)"
              >
                查看来源议题
              </el-button>
            </template>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="内容摘要" :span="2">
            {{ topic.content || '—' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="card-head">
            <span>{{ isParty ? '书记审题' : '双审进度（书记 × 院长）' }}</span>
            <el-button
              v-if="
                roles.canReviewParty.value ||
                roles.canReviewJoint.value ||
                roles.canSubmitReview.value
              "
              size="small"
              type="primary"
              :loading="briefLoading"
              @click="generateBrief"
            >
              生成审题简报
            </el-button>
          </div>
        </template>
        <div v-if="reviewBrief" class="ai-summary" style="margin-bottom: 12px">
          <pre>{{ reviewBrief.outputText }}</pre>
          <div v-if="reviewBrief.checklist?.length" class="brief-checks">
            <el-tag
              v-for="c in reviewBrief.checklist"
              :key="c.key"
              size="small"
              :type="c.ok ? 'success' : 'danger'"
              style="margin: 0 6px 6px 0"
            >
              {{ c.ok ? '通过' : '待补' }} · {{ c.label }}
            </el-tag>
          </div>
          <div class="muted tiny">辅读简报，不构成同意/退回意见</div>
        </div>
        <div class="review-row" v-for="side in reviewSides" :key="side.key">
          <div class="review-name">{{ side.label }}</div>
          <el-tag :type="side.tagType">{{ side.decisionLabel }}</el-tag>
          <div class="review-meta">
            <span v-if="side.reviewer">{{ side.reviewer }}</span>
            <span v-if="side.comment"> · {{ side.comment }}</span>
            <span v-if="side.decidedAt"> · {{ formatTime(side.decidedAt) }}</span>
          </div>
        </div>
        <el-empty
          v-if="!topic.jointReviews?.length"
          :description="isParty ? '尚未提交书记审题' : '尚未提交双审'"
          :image-size="64"
        />
        <div class="hint">
          {{
            topic.isTempMotion
              ? isParty
                ? '临时动议：须书记审题同意后方可入会，并上传临时动议说明。'
                : '临时动议：须书记、院长双签同意后方可入会，并上传临时动议说明。'
              : isParty
                ? '规则：党委书记审题通过后，可形成决议；重大办学关联事项可转联席会。'
                : '规则：双方均同意方可入议程；任一方不同意则暂缓上会。'
          }}
        </div>
      </el-card>
    </div>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>
        <div class="card-head">
          <span>AI 材料摘要</span>
          <div class="card-actions">
            <el-tag v-if="aiSummary?.demo" size="small" type="warning">演示模式</el-tag>
            <el-tag v-else-if="aiSummary" size="small" type="success">大模型</el-tag>
            <el-button
              type="primary"
              size="small"
              :loading="aiLoading"
              :disabled="!hasUploadedMaterial"
              @click="generateSummary"
            >
              生成摘要
            </el-button>
          </div>
        </div>
      </template>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
        :title="aiStatusNote"
      />
      <div v-if="aiSummary" class="ai-summary">
        <pre>{{ aiSummary.outputText }}</pre>
        <div class="muted tiny" style="margin-top: 8px">
          生成于 {{ formatTime(aiSummary.createdAt) }}
          · {{ aiSummary.provider }}/{{ aiSummary.model || '—' }}
          · {{ aiSummary.promptVersion }}
        </div>
      </div>
      <el-empty
        v-else
        description="上传材料后可生成一页纸辅读摘要（不替代原文与审签）"
        :image-size="64"
      />
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>
        <div class="card-head">
          <span>会前材料</span>
          <span class="muted">可上传，不强制齐备</span>
        </div>
      </template>
      <el-table :data="topic.materials || []" size="small">
        <el-table-column prop="name" label="材料名称" min-width="180" />
        <el-table-column label="要求" width="80">
          <template #default>
            <el-tag size="small" type="info">选填</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.uploaded ? 'success' : 'warning'">
              {{ row.uploaded ? '已上传' : '未上传' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="文件" min-width="180">
          <template #default="{ row }">
            <span v-if="row.uploaded">{{ row.originalName || row.filePath }}</span>
            <span v-else class="muted">—</span>
            <div v-if="row.fileSize" class="muted tiny">{{ formatSize(row.fileSize) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-upload
              v-if="!String(row.filePath || '').startsWith('party-resolution://')"
              :show-file-list="false"
              :http-request="(opt: any) => onUpload(row, opt)"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.zip"
            >
              <el-button link type="primary" :loading="uploadingId === row.id">上传</el-button>
            </el-upload>
            <el-button
              link
              type="success"
              :disabled="!row.uploaded || String(row.filePath || '').startsWith('party-resolution://')"
              @click="onDownload(row)"
            >
              下载
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>合规校验日志</template>
      <el-table :data="logs" size="small" empty-text="暂无校验记录">
        <el-table-column prop="ruleCode" label="规则" width="200" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.passed ? 'success' : 'danger'">
              {{ row.passed ? '通过' : '未通过' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="260" />
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>
        <div class="card-head">
          <span>操作记录</span>
          <el-button link type="primary" @click="$router.push('/audit')">全部审计</el-button>
        </div>
      </template>
      <el-table :data="auditLogs" size="small" empty-text="暂无操作记录">
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作人" width="100">
          <template #default="{ row }">{{ row.user?.realName || '—' }}</template>
        </el-table-column>
        <el-table-column prop="action" label="动作" width="160" />
        <el-table-column label="说明" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ formatAuditDetail(row.detail) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="topic.resolution" shadow="never" style="margin-top: 16px">
      <template #header>决议结果</template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="决议类型">{{ topic.resolution.resultType }}</el-descriptions-item>
        <el-descriptions-item label="内容">{{ topic.resolution.content || '—' }}</el-descriptions-item>
        <el-descriptions-item label="公开">
          <el-tag size="small" :type="topic.resolution.isPublic ? 'success' : 'info'">
            {{ topic.resolution.isPublic ? '按规定公开' : '未公开' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="保密级别">
          {{ securityLabel(topic.resolution.securityLevel) }}
        </el-descriptions-item>
      </el-descriptions>
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap">
        <el-button
          v-if="roles.canSaveMinutes.value || roles.canSignMinutes.value"
          @click="togglePublish"
        >
          {{ topic.resolution.isPublic ? '取消公开' : '标记公开' }}
        </el-button>
        <el-button
          v-if="topic.isEmergency && !topic.emergencyConfirmed && roles.canSignMinutes.value"
          type="warning"
          @click="confirmEmergency"
        >
          紧急临机补确认
        </el-button>
        <el-tag v-if="topic.isEmergency && topic.emergencyConfirmed" type="success" size="small">
          紧急临机已双签补确认
        </el-tag>
        <el-tag
          v-else-if="topic.isEmergency && topic.emergencyConfirmSideList?.length"
          type="warning"
          size="small"
        >
          已确认：{{
            topic.emergencyConfirmSideList
              .map((s: string) => (s === 'SECRETARY' ? '书记' : '院长'))
              .join('、')
          }}
        </el-tag>
        <el-button
          v-if="isParty && !topic.transferTo && canTransfer"
          type="warning"
          @click="transferOnly"
        >
          转联席会审议/落实
        </el-button>
      </div>
    </el-card>

    <el-dialog v-model="resolveVisible" title="形成党组织会议决议" width="520px">
      <el-form label-width="110px">
        <el-form-item label="决议类型">
          <el-select v-model="resolveForm.resultType" style="width: 100%">
            <el-option label="批准/通过" value="APPROVED" />
            <el-option label="原则批准" value="PRINCIPLE_APPROVED" />
            <el-option label="暂不形成决议" value="DEFERRED" />
            <el-option label="不予批准" value="REJECTED" />
          </el-select>
        </el-form-item>
        <el-form-item label="决议内容">
          <el-input v-model="resolveForm.content" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="转联席会">
          <el-switch v-model="resolveForm.transferToJoint" />
          <span class="hint">重大办学关联事项建议开启</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveVisible = false">取消</el-button>
        <el-button type="primary" @click="partyResolve">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="proxyVisible" :title="proxyTitle" width="480px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
        title="代审须先电话或当面征得书记/院长同意，系统仅留痕，不替代本人审签。"
      />
      <el-form label-width="100px">
        <el-form-item v-if="!isParty" label="代审一侧">
          <el-select v-model="proxyForm.proxySide" style="width: 100%">
            <el-option label="党委书记" value="SECRETARY" />
            <el-option label="院长" value="DEAN" />
          </el-select>
        </el-form-item>
        <el-form-item label="确认方式">
          <el-select v-model="proxyForm.proxyMethod" style="width: 100%">
            <el-option label="电话确认" value="PHONE" />
            <el-option label="当面确认" value="IN_PERSON" />
          </el-select>
        </el-form-item>
        <el-form-item label="对方姓名">
          <el-input v-model="proxyForm.proxyCounterparty" placeholder="被确认的书记或院长姓名" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="proxyForm.comment" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="proxyVisible = false">取消</el-button>
        <el-button
          :type="proxyForm.decision === 'REJECTED' ? 'danger' : 'primary'"
          :loading="proxySubmitting"
          @click="submitProxyReview"
        >
          确认{{ proxyForm.decision === 'REJECTED' ? '退回' : '通过' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
  <el-empty v-else description="加载中…" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import http from '@/api/http'
import { downloadWithAuth } from '@/api/download'
import { useRoles } from '@/composables/useRoles'

const route = useRoute()
const router = useRouter()
const roles = useRoles()
const topic = ref<any>(null)
const logs = ref<any[]>([])
const auditLogs = ref<any[]>([])
const uploadingId = ref('')
const resolveVisible = ref(false)
const proxyVisible = ref(false)
const proxySubmitting = ref(false)
const proxyForm = reactive({
  decision: 'APPROVED' as 'APPROVED' | 'REJECTED',
  proxyMethod: 'PHONE' as 'PHONE' | 'IN_PERSON',
  proxyCounterparty: '',
  proxySide: 'SECRETARY' as 'SECRETARY' | 'DEAN',
  comment: '',
})
const aiSummary = ref<any>(null)
const aiLoading = ref(false)
const reviewBrief = ref<any>(null)
const briefLoading = ref(false)
const aiStatusNote = ref(
  'AI 辅助生成，须人工核对，以制度与原文为准。未配置密钥时为本地演示摘要。',
)
const resolveForm = reactive({
  resultType: 'APPROVED',
  content: '',
  transferToJoint: false,
})

const STATUS_MAP: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审',
  DEFERRED: '已暂缓',
  APPROVED: '审题/双审通过',
  ON_AGENDA: '已入议程',
  DISCUSSED: '已讨论',
  RESOLVED: '已决议',
  REJECTED: '未通过',
}

const DECISION_MAP: Record<string, string> = {
  PENDING: '待审',
  APPROVED: '同意',
  REJECTED: '暂缓/不同意',
}

const isParty = computed(() => topic.value?.meetingType === 'PARTY_COMMITTEE')

function statusLabel(s: string) {
  return STATUS_MAP[s] || s
}
function formatTime(v?: string) {
  if (!v) return ''
  return new Date(v).toLocaleString('zh-CN')
}
function securityLabel(s?: string) {
  const map: Record<string, string> = {
    PUBLIC: '公开',
    INTERNAL: '内部',
    SECRET: '秘密',
  }
  return map[s || ''] || s || '内部'
}
function formatAuditDetail(d?: string) {
  if (!d) return '—'
  try {
    return JSON.stringify(JSON.parse(d))
  } catch {
    return d
  }
}
function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
const hasUploadedMaterial = computed(() =>
  (topic.value?.materials || []).some(
    (m: any) =>
      m.uploaded && !String(m.filePath || '').startsWith('party-resolution://'),
  ),
)
const canSubmit = computed(() => {
  const s = topic.value?.status
  return s === 'DRAFT' || s === 'DEFERRED'
})
const canPartyResolve = computed(() => topic.value?.status === 'APPROVED' && !topic.value?.resolution)
const canTransfer = computed(() => {
  const t = topic.value?.resolution?.resultType
  return t === 'APPROVED' || t === 'PRINCIPLE_APPROVED'
})

const reviewSides = computed(() => {
  const reviews = topic.value?.jointReviews || []
  const sides = isParty.value
    ? [{ key: 'SECRETARY', label: '党委书记' }]
    : [
        { key: 'SECRETARY', label: '党委书记' },
        { key: 'DEAN', label: '院长' },
      ]
  return sides.map((side) => {
    const r = reviews.find((x: any) => x.side === side.key)
    const decision = r?.decision || 'PENDING'
    return {
      ...side,
      decision,
      decisionLabel: r ? DECISION_MAP[decision] || decision : '未发起',
      tagType:
        decision === 'APPROVED' ? 'success' : decision === 'REJECTED' ? 'danger' : 'info',
      reviewer: r?.reviewer?.realName,
      comment: r?.comment,
      decidedAt: r?.decidedAt,
    }
  })
})

function goBack() {
  if (route.query.from === 'school') {
    router.push('/school-topics')
    return
  }
  router.push(isParty.value ? '/party-topics' : '/topics')
}

async function load() {
  const id = String(route.params.id)
  topic.value = await http.get(`/topics/${id}`)
  logs.value = await http.get('/compliance/logs', { params: { topicId: id } })
  try {
    auditLogs.value = await http.get('/audit/logs', {
      params: { resource: 'Topic', resourceId: id },
    })
  } catch {
    auditLogs.value = []
  }
  try {
    const st: any = await http.get('/ai/status')
    aiStatusNote.value = st.configured
      ? `已配置大模型（${st.provider}/${st.model}）。AI 辅助生成，须人工核对，以制度与原文为准。`
      : '未配置 LLM_API_KEY，当前为本地演示摘要。AI 辅助生成，须人工核对，以制度与原文为准。'
  } catch {
    /* ignore */
  }
  try {
    const latest: any = await http.get(`/ai/topics/${id}/material-summary`)
    aiSummary.value = latest?.summary || null
  } catch {
    aiSummary.value = null
  }
  try {
    const brief: any = await http.get(`/ai/topics/${id}/review-brief`)
    reviewBrief.value = brief?.brief || null
  } catch {
    reviewBrief.value = null
  }
  if (topic.value?.meetingType === 'PARTY_COMMITTEE' && !route.query.from) {
    router.replace({ query: { ...route.query, from: 'party' } })
  }
}

async function generateBrief() {
  briefLoading.value = true
  try {
    reviewBrief.value = await http.post(`/ai/topics/${route.params.id}/review-brief`)
    ElMessage.success('审题简报已生成')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    briefLoading.value = false
  }
}

async function generateSummary() {
  aiLoading.value = true
  try {
    aiSummary.value = await http.post(
      `/ai/topics/${route.params.id}/material-summary`,
    )
    ElMessage.success(
      aiSummary.value?.demo ? '已生成演示摘要（未配置大模型密钥）' : '摘要已生成',
    )
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    aiLoading.value = false
  }
}

async function onUpload(row: any, options: UploadRequestOptions) {
  uploadingId.value = row.id
  try {
    const fd = new FormData()
    fd.append('file', options.file as File)
    await http.post(`/topics/materials/${row.id}/upload`, fd)
    ElMessage.success(`已上传：${(options.file as File).name}`)
    options.onSuccess?.({})
    await load()
  } catch (e: any) {
    options.onError?.(e as any)
    ElMessage.error(String(e))
  } finally {
    uploadingId.value = ''
  }
}

async function onDownload(row: any) {
  try {
    await downloadWithAuth(
      `/topics/materials/${row.id}/download`,
      row.originalName || row.name || 'material',
    )
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function submitReview() {
  try {
    await http.post(`/topics/${topic.value.id}/submit-review`)
    ElMessage.success(isParty.value ? '已提交党委书记审题' : '已提交书记、院长双审')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function review(decision: 'APPROVED' | 'REJECTED') {
  try {
    await http.post(`/topics/${topic.value.id}/review`, { decision })
    ElMessage.success(decision === 'APPROVED' ? '已同意' : '已暂缓')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

const proxyTitle = computed(() =>
  proxyForm.decision === 'REJECTED' ? '代审退回' : '代审通过',
)

function openProxyReview(decision: 'APPROVED' | 'REJECTED') {
  proxyForm.decision = decision
  proxyForm.proxyMethod = 'PHONE'
  proxyForm.proxyCounterparty = ''
  proxyForm.proxySide = 'SECRETARY'
  proxyForm.comment = ''
  proxyVisible.value = true
}

async function submitProxyReview() {
  if (!proxyForm.proxyCounterparty.trim()) {
    ElMessage.warning('请填写对方姓名')
    return
  }
  proxySubmitting.value = true
  try {
    await http.post(`/topics/${topic.value.id}/review`, {
      decision: proxyForm.decision,
      comment: proxyForm.comment || undefined,
      proxy: true,
      proxyMethod: proxyForm.proxyMethod,
      proxyCounterparty: proxyForm.proxyCounterparty.trim(),
      ...(isParty.value ? {} : { proxySide: proxyForm.proxySide }),
    })
    ElMessage.success(proxyForm.decision === 'APPROVED' ? '已代审通过' : '已代审退回')
    proxyVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    proxySubmitting.value = false
  }
}

function openPartyResolve() {
  resolveForm.resultType = 'APPROVED'
  resolveForm.content = ''
  resolveForm.transferToJoint = Boolean(topic.value?.isMajor)
  resolveVisible.value = true
}

async function partyResolve() {
  try {
    await http.post(`/topics/${topic.value.id}/party-resolve`, resolveForm)
    ElMessage.success(
      resolveForm.transferToJoint ? '决议已形成，并已转联席会' : '党组织会议决议已形成',
    )
    resolveVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function transferOnly() {
  try {
    const res: any = await http.post(`/topics/${topic.value.id}/transfer-to-joint`)
    ElMessage.success('已转联席会')
    await load()
    if (res.targetTopicId) {
      router.push(`/topics/${res.targetTopicId}`)
    }
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function confirmEmergency() {
  try {
    const res: any = await http.post(`/topics/${topic.value.id}/confirm-emergency`, {
      note: '事后补报联席会确认',
    })
    ElMessage.success(res.message || '已补确认')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function togglePublish() {
  try {
    const next = !topic.value.resolution?.isPublic
    await http.post(`/topics/${topic.value.id}/publish-resolution`, {
      isPublic: next,
      securityLevel: next ? 'PUBLIC' : 'INTERNAL',
    })
    ElMessage.success(next ? '已标记按规定公开' : '已取消公开')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

onMounted(load)
</script>

<style scoped>
.hero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
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
.detail-actions .ui-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
.grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
}
.review-row {
  display: grid;
  grid-template-columns: 88px 110px 1fr;
  gap: 8px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.review-name {
  font-weight: 600;
}
.review-meta,
.muted,
.hint {
  color: var(--muted);
  font-size: 13px;
}
.hint {
  margin-top: 12px;
  margin-left: 8px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ai-summary pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text, #1f2937);
  background: #f8fafc;
  border: 1px solid var(--line, #e5e7eb);
  border-radius: 8px;
  padding: 12px 14px;
}
.brief-checks {
  margin-top: 8px;
}
.tiny {
  font-size: 12px;
  margin-top: 2px;
}
@media (max-width: 960px) {
  .grid,
  .review-row {
    grid-template-columns: 1fr;
  }
  .card-head {
    flex-wrap: wrap;
    gap: 8px;
  }
}
@media (max-width: 640px) {
  .detail :deep(.el-button) {
    margin-bottom: 4px;
  }
}
</style>
