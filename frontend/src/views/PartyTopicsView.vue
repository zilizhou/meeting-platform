<template>
  <div>
    <div class="ui-hero party">
      <div class="eyebrow"><b></b> 党委红轨 · {{ mineMode ? '我的议题' : '议题库' }}</div>
      <h2>{{ mineMode ? '我的党组织会议议题' : '党组织会议议题库' }}</h2>
      <p>
        {{
          mineMode
            ? '仅显示您作为申报人提交的党组织会议议题，可跟踪审题与入会进度。'
            : '学院党组织会议历次议题的集中管理入口。须有「第一议题」入会后方可开会；学院管理员可直接审题。'
        }}
      </p>
      <div class="nums">
        <button
          type="button"
          class="num all"
          :class="{ on: activeTab === 'all' }"
          @click="activeTab = 'all'"
        >
          <strong>{{ scopedTopics.length }}</strong><span>全部</span>
        </button>
        <button
          type="button"
          class="num party"
          :class="{ on: activeTab === 'review' }"
          @click="activeTab = 'review'"
        >
          <strong>{{ countOf(['PENDING_REVIEW', 'DEFERRED']) }}</strong><span>待审</span>
        </button>
        <button
          type="button"
          class="num party"
          :class="{ on: activeTab === 'resolved' }"
          @click="activeTab = 'resolved'"
        >
          <strong>{{ countOf(['RESOLVED']) }}</strong><span>已决议</span>
        </button>
      </div>
    </div>

    <div v-if="!mineMode" class="rule-banner party">
      <strong>第一议题 · 审题</strong>
      党组织会议必须把「第一议题（政治理论学习）」纳入议程，否则不能开会。
      学院管理员可直接同意/暂缓。
      <template v-if="!roles.canSeeFullTopicLibrary.value"> 当前仅显示与您相关的议题。</template>
    </div>
    <div v-if="!mineMode && !hasReadyFirstTopic" class="rule-banner warn">
      <strong>尚未备妥第一议题</strong>
      议题库里还没有已审过的第一议题。请先征集并完成书记审题，否则无法创建/召开党组织会议。
    </div>

    <div class="ui-filter-wrap">
      <div ref="filterEl" class="ui-filter is-scroll" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="party"
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
      <h3><i class="party"></i>{{ mineMode ? '我的议题' : '议题列表' }}</h3>
      <div class="ui-sec-actions">
        <button
          v-if="roles.canCreateTopic.value"
          class="ui-btn party"
          type="button"
          @click="openCreate"
        >
          申报议题
        </button>
        <button class="ui-link" type="button" @click="load">刷新</button>
        <span class="n">{{ filteredTopics.length }} 项</span>
      </div>
    </div>

    <div v-if="!filteredTopics.length" class="ui-empty">
      {{ mineMode ? '暂无本人申报的议题' : '当前分组暂无议题' }}
      <div v-if="!scopedTopics.length && roles.canCreateTopic.value" style="margin-top: 10px">
        <button class="ui-btn party" type="button" @click="openCreate">去申报议题</button>
      </div>
    </div>

    <article v-for="t in filteredTopics" :key="t.id" class="ui-card party">
      <div class="top">
        <span class="ui-tag" :class="statusInfo(t).tag">{{ statusInfo(t).label }}</span>
        <span v-if="t.category?.code === 'FIRST_TOPIC'" class="ui-tag party">第一议题</span>
        <span v-if="t.transferTo" class="ui-tag joint">已转联席会</span>
        <span v-if="t.isMajor" class="ui-tag warn">重大</span>
        <span v-if="t.isTempMotion" class="ui-tag warn">临时动议</span>
      </div>

      <h4 class="card-title" @click="$router.push(`/topics/${t.id}?from=party`)">{{ t.title }}</h4>
      <p v-if="t.content" class="content-line">{{ t.content }}</p>

      <div class="meta">
        分类：{{ t.category?.name || '未分类' }} · 提交人：{{ t.proposer?.realName || '—' }} ·
        提交时间：{{ formatTime(t.createdAt) }}
      </div>

      <div class="foot">
        <div class="foot-links">
          <button class="ui-link" type="button" @click="$router.push(`/topics/${t.id}?from=party`)">
            详情
          </button>
          <button
            v-if="roles.canSubmitReview.value && (t.status === 'DRAFT' || t.status === 'DEFERRED')"
            class="ui-link"
            type="button"
            @click="submitReview(t)"
          >
            提交书记审
          </button>
          <button
            v-if="roles.canReviewParty.value && t.status === 'PENDING_REVIEW'"
            class="ui-link"
            type="button"
            @click="review(t, 'APPROVED')"
          >
            同意
          </button>
          <button
            v-if="roles.canReviewParty.value && t.status === 'PENDING_REVIEW'"
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

    <el-dialog v-model="editVisible" title="编辑党组织会议议题" width="560px">
      <el-form label-width="110px">
        <el-form-item label="标题">
          <el-input v-model="editForm.title" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select
            v-model="editForm.categoryId"
            style="width: 100%"
            @change="onEditCategory"
          >
            <el-option
              v-for="c in categories"
              :key="c.id"
              :label="c.code === 'FIRST_TOPIC' ? `第一议题 · ${c.name}` : c.name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="editForm.content" type="textarea" :rows="6" />
        </el-form-item>
        <el-form-item label="第一议题">
          <el-switch v-model="editForm.isFirstTopic" @change="onEditFirstTopic" />
          <span class="muted" style="margin-left: 8px; font-size: 12px">政治理论学习，创建会议时必选</span>
        </el-form-item>
        <el-form-item label="重大事项">
          <el-switch v-model="editForm.isMajor" />
        </el-form-item>
        <el-form-item label="临时动议">
          <el-switch v-model="editForm.isTempMotion" />
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
        title="代审须先电话或当面征得书记同意，系统仅留痕，不替代本人审签。"
      />
      <el-form label-width="100px">
        <el-form-item label="确认方式">
          <el-select v-model="proxyForm.proxyMethod" style="width: 100%">
            <el-option label="电话确认" value="PHONE" />
            <el-option label="当面确认" value="IN_PERSON" />
          </el-select>
        </el-form-item>
        <el-form-item label="对方姓名">
          <el-input v-model="proxyForm.proxyCounterparty" placeholder="被确认的书记姓名" />
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
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'

const route = useRoute()
const router = useRouter()
const roles = useRoles()
const mineMode = computed(() => String(route.query.mine || '') === '1')
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
  comment: '',
})
const editForm = reactive({
  title: '',
  content: '',
  categoryId: '',
  isFirstTopic: false,
  isMajor: false,
  isTempMotion: false,
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

const scopedTopics = computed(() => {
  if (!mineMode.value) return topics.value
  const uid = roles.auth.user?.id
  return topics.value.filter((t) => t.proposer?.id === uid)
})

const filteredTopics = computed(() => {
  const def = tabs.find((d) => d.key === activeTab.value)
  if (!def || !def.statuses.length) return scopedTopics.value
  return scopedTopics.value.filter((t) => def.statuses.includes(t.status))
})

const hasReadyFirstTopic = computed(() =>
  topics.value.some(
    (t) =>
      t.category?.code === 'FIRST_TOPIC' &&
      ['APPROVED', 'ON_AGENDA', 'RESOLVED'].includes(t.status),
  ),
)

const proxyTitle = computed(() =>
  proxyForm.decision === 'REJECTED' ? '代审退回' : '代审通过',
)

function countOf(statuses: string[]) {
  if (!statuses.length) return scopedTopics.value.length
  return scopedTopics.value.filter((t) => statuses.includes(t.status)).length
}

/** 已上会/已闭会流程状态，普通提交人不可再自行修改或删除 */
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
      return { label: '待书记审题', tag: 'warn' }
    case 'DEFERRED':
      return { label: '已暂缓·待修改', tag: 'warn' }
    case 'APPROVED':
      return { label: '审题通过·待排会', tag: 'joint' }
    case 'ON_AGENDA':
      if (t.meeting?.status === 'IN_PROGRESS') return { label: '讨论中', tag: 'danger' }
      if (t.meeting?.status === 'SCHEDULED') return { label: '已排期·待开会', tag: 'joint' }
      return { label: '已入议程', tag: 'joint' }
    case 'DISCUSSED':
      return { label: '已暂缓·待再议', tag: 'warn' }
    case 'RESOLVED':
      if (t.resolution?.resultType === 'PRINCIPLE_APPROVED') {
        return { label: '已决议·原则同意', tag: 'ok' }
      }
      return { label: '已决议·同意', tag: 'ok' }
    case 'REJECTED':
      return { label: '未通过', tag: 'danger' }
    default:
      return { label: t.status, tag: '' }
  }
}

async function load() {
  topics.value = await http.get('/topics', {
    params: { meetingType: 'PARTY_COMMITTEE' },
  })
  categories.value = await http.get('/org/categories', {
    params: { meetingType: 'PARTY_COMMITTEE' },
  })
}

function openCreate() {
  router.push({ name: 'topic-create', query: { meetingType: 'PARTY_COMMITTEE' } })
}

function openEdit(t: any) {
  editingId.value = t.id
  editForm.title = t.title
  editForm.content = t.content || ''
  editForm.categoryId = t.categoryId || ''
  editForm.isFirstTopic = t.category?.code === 'FIRST_TOPIC'
  editForm.isMajor = Boolean(t.isMajor)
  editForm.isTempMotion = Boolean(t.isTempMotion)
  editVisible.value = true
}

function onEditCategory() {
  const cat = categories.value.find((c) => c.id === editForm.categoryId)
  editForm.isFirstTopic = cat?.code === 'FIRST_TOPIC'
}

function onEditFirstTopic(checked: boolean) {
  const first = categories.value.find((c) => c.code === 'FIRST_TOPIC')
  if (checked) {
    if (first) editForm.categoryId = first.id
    else ElMessage.warning('系统未配置第一议题分类')
  } else if (first && editForm.categoryId === first.id) {
    editForm.categoryId = ''
  }
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
    ElMessage.success('已提交党委书记审题')
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

function openProxyReview(t: any, decision: 'APPROVED' | 'REJECTED') {
  proxyTopicId.value = t.id
  proxyForm.decision = decision
  proxyForm.proxyMethod = 'PHONE'
  proxyForm.proxyCounterparty = ''
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
  background: #f8fafc;
  border: 1px solid var(--line);
  font-size: 13px;
  line-height: 1.55;
  color: var(--text);
}
.rule-banner strong {
  display: block;
  margin-bottom: 2px;
}
.rule-banner.party {
  background: #fff7f4;
  border-color: #f1c6bb;
}
.rule-banner.warn {
  background: #fff7ed;
  border-color: #fdba74;
}
.ui-sec h3 i.party {
  background: var(--party);
}

.card-title {
  cursor: pointer;
}
.card-title:hover {
  color: var(--party);
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

.ui-tag.danger {
  background: var(--party-soft);
  color: var(--party);
}
</style>
