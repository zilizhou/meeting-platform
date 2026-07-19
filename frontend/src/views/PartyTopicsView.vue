<template>
  <div>
    <div class="ui-hero party">
      <div class="eyebrow"><b></b> 党委红轨 · 议题库</div>
      <h2>党组织会议议题库</h2>
      <p>学院党组织会议历次议题的集中管理入口</p>
      <div class="nums">
        <div><strong>{{ topics.length }}</strong><span>全部</span></div>
        <div><strong>{{ countOf(['PENDING_REVIEW', 'DEFERRED']) }}</strong><span>待审</span></div>
        <div><strong>{{ countOf(['RESOLVED']) }}</strong><span>已决议</span></div>
      </div>
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
      <h3><i class="party"></i>议题列表</h3>
      <div class="ui-sec-actions">
        <button
          v-if="roles.canCreateTopic.value"
          class="ui-btn party"
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
        <button class="ui-btn party" type="button" @click="openCreate">去议题征集</button>
      </div>
    </div>

    <article v-for="t in filteredTopics" :key="t.id" class="ui-card party">
      <div class="top">
        <span class="ui-tag" :class="statusInfo(t).tag">{{ statusInfo(t).label }}</span>
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
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
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
const editForm = reactive({
  title: '',
  content: '',
  categoryId: '',
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

const filteredTopics = computed(() => {
  const def = tabs.find((d) => d.key === activeTab.value)
  if (!def || !def.statuses.length) return topics.value
  return topics.value.filter((t) => def.statuses.includes(t.status))
})

function countOf(statuses: string[]) {
  if (!statuses.length) return topics.value.length
  return topics.value.filter((t) => statuses.includes(t.status)).length
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
  editForm.isMajor = Boolean(t.isMajor)
  editForm.isTempMotion = Boolean(t.isTempMotion)
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

onMounted(load)
</script>

<style scoped>
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
