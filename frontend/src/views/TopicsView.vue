<template>
  <div>
    <div class="ui-hero joint">
      <div class="eyebrow"><b></b> 联席蓝轨 · 议题库</div>
      <h2>党政联席会议题库</h2>
      <p>征集后的议题在此集中办理：补材料、提交双审、学院审核与入会准备。</p>
      <div class="nums">
        <button
          type="button"
          class="num all"
          :class="{ on: activeTab === 'all' }"
          @click="activeTab = 'all'"
        >
          <strong>{{ topics.length }}</strong><span>全部</span>
        </button>
        <button
          type="button"
          class="num joint"
          :class="{ on: activeTab === 'review' }"
          @click="activeTab = 'review'"
        >
          <strong>{{ countOf(['PENDING_REVIEW', 'DEFERRED']) }}</strong><span>待审</span>
        </button>
        <button
          type="button"
          class="num joint"
          :class="{ on: activeTab === 'agenda' }"
          @click="activeTab = 'agenda'"
        >
          <strong>{{ countOf(['APPROVED', 'ON_AGENDA']) }}</strong><span>已排会</span>
        </button>
      </div>
    </div>

    <div class="rule-banner">
      <strong>可见范围 · 审题</strong>
      书记、副书记、院长、副院长、学院管理员、会议秘书可看全量议题；列席、委员、部门负责人仅看与自己相关的议题。
      学院管理员可直接同意/暂缓（一次完成双审），也可代审留痕。
      <template v-if="!roles.canSeeFullTopicLibrary.value"> 当前仅显示与您相关的议题。</template>
    </div>

    <div class="ui-filter-wrap">
      <div ref="filterEl" class="ui-filter is-scroll" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          :class="{ on: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}<template v-if="tab.statuses.length"> · {{ countOf(tab.statuses) }}</template>
        </button>
      </div>
    </div>

    <div class="ui-sec">
      <h3><i></i>议题列表</h3>
      <div class="ui-sec-actions">
        <button
          v-if="roles.canCreateTopic.value"
          class="ui-btn"
          type="button"
          @click="openCreate"
        >
          议题征集
        </button>
        <button class="ui-link" type="button" @click="load">刷新</button>
        <span class="n">{{ filteredTopics.length }} 项</span>
      </div>
    </div>

    <div v-if="!filteredTopics.length" class="ui-empty">
      当前分组暂无议题
      <div v-if="!topics.length && roles.canCreateTopic.value" style="margin-top: 10px">
        <button class="ui-btn" type="button" @click="openCreate">去议题征集</button>
      </div>
    </div>

    <article v-for="t in filteredTopics" :key="t.id" class="ui-card joint">
      <div class="top">
        <span class="ui-tag" :class="statusInfo(t).tag">{{ statusInfo(t).label }}</span>
        <span v-if="t.isEmergency" class="ui-tag warn">紧急临机</span>
        <span v-else-if="t.isTempMotion" class="ui-tag warn">临时动议</span>
        <span v-if="t.isMajor" class="ui-tag warn">重大</span>
        <span v-if="t.needPartyPrecheck" class="ui-tag joint">党委前置</span>
        <span v-if="t.resolution?.isPublic" class="ui-tag ok">已公开</span>
      </div>

      <h4 class="card-title" @click="$router.push(`/topics/${t.id}`)">{{ t.title }}</h4>
      <p v-if="t.content" class="content-line">{{ t.content }}</p>

      <div class="meta">
        分类：{{ t.category?.name || '未分类' }} · 提交人：{{ t.proposer?.realName || '—' }} ·
        提交时间：{{ formatTime(t.createdAt) }}
        <template v-if="reviewSummary(t)"> · {{ reviewSummary(t) }}</template>
      </div>

      <div class="foot">
        <div class="foot-links">
          <button class="ui-link" type="button" @click="$router.push(`/topics/${t.id}`)">详情</button>
          <button
            v-if="roles.canSubmitReview.value && (t.status === 'DRAFT' || t.status === 'DEFERRED')"
            class="ui-link"
            type="button"
            @click="submitReview(t)"
          >
            提交双审
          </button>
          <button
            v-if="roles.canReviewJoint.value && t.status === 'PENDING_REVIEW'"
            class="ui-link"
            type="button"
            @click="review(t, 'APPROVED')"
          >
            同意
          </button>
          <button
            v-if="roles.canReviewJoint.value && t.status === 'PENDING_REVIEW'"
            class="ui-link"
            type="button"
            @click="review(t, 'REJECTED')"
          >
            暂缓
          </button>
          <button
            v-if="roles.canProxyReview.value && t.status === 'PENDING_REVIEW'"
            class="ui-link"
            type="button"
            @click="openProxyReview(t, 'APPROVED')"
          >
            代审通过
          </button>
          <button
            v-if="roles.canProxyReview.value && t.status === 'PENDING_REVIEW'"
            class="ui-link"
            type="button"
            style="color: var(--party)"
            @click="openProxyReview(t, 'REJECTED')"
          >
            代审退回
          </button>
          <button v-if="canEdit(t)" class="ui-link" type="button" @click="openEdit(t)">编辑</button>
        </div>
        <el-popconfirm
          v-if="canDelete(t)"
          title="确认删除该议题？删除后不可恢复"
          confirm-button-type="danger"
          @confirm="removeTopic(t)"
        >
          <template #reference>
            <button class="ui-link" type="button" style="color: var(--party)">删除</button>
          </template>
        </el-popconfirm>
      </div>
    </article>

    <el-dialog v-model="editVisible" title="编辑党政联席会议题" width="560px">
      <el-form label-width="110px">
        <el-form-item label="标题">
          <el-input v-model="editForm.title" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editForm.categoryId" style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="editForm.content" type="textarea" :rows="6" />
        </el-form-item>
        <el-form-item label="重大事项">
          <el-switch v-model="editForm.isMajor" />
        </el-form-item>
        <el-form-item label="临时动议">
          <el-switch v-model="editForm.isTempMotion" />
        </el-form-item>
        <el-form-item label="紧急临机">
          <el-switch v-model="editForm.isEmergency" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
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
        <el-form-item label="代审一侧">
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
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'

const router = useRouter()
const roles = useRoles()
const topics = ref<any[]>([])
const categories = ref<any[]>([])
const editVisible = ref(false)
const saving = ref(false)
const editingId = ref('')
const proxyVisible = ref(false)
const proxySubmitting = ref(false)
const proxyTopicId = ref('')
const proxyForm = reactive({
  decision: 'APPROVED' as 'APPROVED' | 'REJECTED',
  proxyMethod: 'PHONE' as 'PHONE' | 'IN_PERSON',
  proxyCounterparty: '',
  proxySide: 'SECRETARY' as 'SECRETARY' | 'DEAN',
  comment: '',
})
const editForm = reactive({
  title: '',
  content: '',
  categoryId: '',
  isMajor: false,
  isTempMotion: false,
  isEmergency: false,
})

interface TabDef {
  key: string
  label: string
  statuses: string[]
}

const tabs: TabDef[] = [
  { key: 'all', label: '全部', statuses: [] },
  { key: 'draft', label: '草稿', statuses: ['DRAFT'] },
  { key: 'review', label: '待审', statuses: ['PENDING_REVIEW', 'DEFERRED'] },
  { key: 'agenda', label: '已排会', statuses: ['APPROVED', 'ON_AGENDA'] },
  { key: 'discussed', label: '已暂缓', statuses: ['DISCUSSED'] },
  { key: 'resolved', label: '已决议', statuses: ['RESOLVED'] },
  { key: 'rejected', label: '未通过', statuses: ['REJECTED'] },
]
const activeTab = ref('all')
const filterEl = ref<HTMLElement | null>(null)

watch(activeTab, () => {
  nextTick(() => {
    filterEl.value?.querySelector('button.on')?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  })
})

const filteredTopics = computed(() => {
  const def = tabs.find((d) => d.key === activeTab.value)
  if (!def || !def.statuses.length) return topics.value
  return topics.value.filter((t) => def.statuses.includes(t.status))
})

const proxyTitle = computed(() =>
  proxyForm.decision === 'REJECTED' ? '代审退回' : '代审通过',
)

function countOf(statuses: string[]) {
  if (!statuses.length) return topics.value.length
  return topics.value.filter((t) => statuses.includes(t.status)).length
}

const LOCKED_STATUSES = ['ON_AGENDA', 'DISCUSSED', 'RESOLVED']

function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isOwner(t: any) {
  return t.proposer?.id === roles.auth.user?.id
}

function canEdit(t: any) {
  if (roles.canManageTopicLibrary.value) return true
  if (!isOwner(t)) return false
  return !LOCKED_STATUSES.includes(t.status)
}

function canDelete(t: any) {
  if (roles.canManageTopicLibrary.value) return true
  if (!isOwner(t)) return false
  return !t.meetingId && !LOCKED_STATUSES.includes(t.status)
}

function statusInfo(t: any): { label: string; tag: '' | 'party' | 'joint' | 'warn' | 'ok' | 'danger' } {
  switch (t.status) {
    case 'DRAFT':
      return { label: '草稿', tag: '' }
    case 'PENDING_REVIEW':
      return { label: '待双审', tag: 'warn' }
    case 'DEFERRED':
      return { label: '已暂缓·待修改', tag: 'warn' }
    case 'APPROVED':
      return { label: '双审通过·待排会', tag: 'joint' }
    case 'ON_AGENDA':
      if (t.meeting?.status === 'IN_PROGRESS') return { label: '讨论中', tag: 'danger' }
      if (t.meeting?.status === 'SCHEDULED') return { label: '已排期·待开会', tag: 'joint' }
      return { label: '已入议程', tag: 'joint' }
    case 'DISCUSSED':
      return { label: '已暂缓·待再议', tag: 'warn' }
    case 'RESOLVED':
      return { label: '已决议', tag: 'ok' }
    case 'REJECTED':
      return { label: '未通过', tag: 'danger' }
    default:
      return { label: t.status, tag: '' }
  }
}

function reviewSummary(t: any) {
  const reviews = t.jointReviews || []
  if (!reviews.length) return ''
  return reviews
    .map((r: any) => `${r.side === 'SECRETARY' ? '书记' : '院长'}:${decisionLabel(r.decision)}`)
    .join(' · ')
}

function decisionLabel(s: string) {
  if (s === 'PENDING') return '待审'
  if (s === 'APPROVED') return '同意'
  if (s === 'REJECTED') return '暂缓'
  return s
}

async function load() {
  topics.value = await http.get('/topics', {
    params: { meetingType: 'JOINT_CONFERENCE' },
  })
  categories.value = await http.get('/org/categories', {
    params: { meetingType: 'JOINT_CONFERENCE' },
  })
}

function openCreate() {
  router.push({ name: 'topic-create', query: { meetingType: 'JOINT_CONFERENCE' } })
}

function openEdit(t: any) {
  editingId.value = t.id
  editForm.title = t.title
  editForm.content = t.content || ''
  editForm.categoryId = t.categoryId || ''
  editForm.isMajor = Boolean(t.isMajor)
  editForm.isTempMotion = Boolean(t.isTempMotion)
  editForm.isEmergency = Boolean(t.isEmergency)
  editVisible.value = true
}

async function saveEdit() {
  if (!editForm.title.trim() || editForm.title.trim().length < 2) {
    ElMessage.warning('请确认议题标题（至少 2 字）')
    return
  }
  saving.value = true
  try {
    await http.patch(`/topics/${editingId.value}`, {
      title: editForm.title.trim(),
      content: editForm.content.trim(),
      categoryId: editForm.categoryId || undefined,
      isMajor: editForm.isMajor,
      isTempMotion: editForm.isTempMotion,
      isEmergency: editForm.isEmergency,
    })
    ElMessage.success('已保存修改')
    editVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    saving.value = false
  }
}

async function removeTopic(t: any) {
  try {
    await http.delete(`/topics/${t.id}`)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function submitReview(row: any) {
  try {
    await http.post(`/topics/${row.id}/submit-review`)
    ElMessage.success('已提交书记、院长双审')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

async function review(row: any, decision: 'APPROVED' | 'REJECTED') {
  try {
    await http.post(`/topics/${row.id}/review`, { decision })
    ElMessage.success(decision === 'APPROVED' ? '已同意' : '已暂缓')
    await load()
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

function openProxyReview(row: any, decision: 'APPROVED' | 'REJECTED') {
  proxyTopicId.value = row.id
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
    await http.post(`/topics/${proxyTopicId.value}/review`, {
      decision: proxyForm.decision,
      comment: proxyForm.comment || undefined,
      proxy: true,
      proxyMethod: proxyForm.proxyMethod,
      proxyCounterparty: proxyForm.proxyCounterparty.trim(),
      proxySide: proxyForm.proxySide,
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

onMounted(load)
</script>

<style scoped>
.rule-banner {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f0f7ff;
  border: 1px solid #bfdbfe;
  font-size: 13px;
  line-height: 1.55;
}
.rule-banner strong {
  display: block;
  margin-bottom: 2px;
}
.card-title {
  cursor: pointer;
}
.card-title:hover {
  color: var(--joint);
}
.content-line {
  margin: 6px 0 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.foot-links {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.ui-tag.ok {
  background: #e6f4ec;
  color: var(--ok);
}
</style>
