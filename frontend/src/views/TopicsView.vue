<template>
  <div>
    <div class="toolbar">
      <el-button v-if="roles.canCreateTopic.value" type="primary" @click="openCreate">
        议题征集
      </el-button>
      <el-button @click="load">刷新</el-button>
    </div>

    <div class="rule-banner">
      <strong>可见范围 · 代审</strong>
      书记、副书记、院长、副院长、学院管理员、会议秘书可看全量议题；列席、委员、部门负责人仅看与自己相关的议题。
      学院管理员可在待审条目上代审通过或退回（须电话/当面确认）。
      <template v-if="!roles.canSeeFullTopicLibrary.value"> 当前仅显示与您相关的议题。</template>
    </div>

    <el-empty v-if="!topics.length" description="暂无联席会议题">
      <el-button v-if="roles.canCreateTopic.value" type="primary" @click="openCreate">
        去议题征集
      </el-button>
    </el-empty>
    <el-table v-else :data="topics" stripe>
      <el-table-column prop="title" label="议题" min-width="220">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/topics/${row.id}`)">
            {{ row.title }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="分类" width="140">
        <template #default="{ row }">{{ row.category?.name || '-' }}</template>
      </el-table-column>
      <el-table-column label="标记" width="200">
        <template #default="{ row }">
          <el-tag v-if="row.isEmergency" size="small" type="danger">紧急临机</el-tag>
          <el-tag v-else-if="row.isTempMotion" size="small" type="danger">临时动议</el-tag>
          <el-tag v-else-if="row.isMajor" size="small" type="warning">重大</el-tag>
          <el-tag v-if="row.needPartyPrecheck" size="small" type="info" style="margin-left: 4px">
            党委前置
          </el-tag>
          <el-tag
            v-if="row.resolution?.isPublic"
            size="small"
            type="success"
            style="margin-left: 4px"
          >
            已公开
          </el-tag>
          <span
            v-if="
              !row.isTempMotion &&
              !row.isMajor &&
              !row.needPartyPrecheck &&
              !row.isEmergency &&
              !row.resolution?.isPublic
            "
            class="muted"
          >
            —
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">{{ statusLabel(row.status) }}</template>
      </el-table-column>
      <el-table-column label="双审" width="200">
        <template #default="{ row }">
          <span v-for="r in row.jointReviews || []" :key="r.id" class="tag">
            {{ r.side === 'SECRETARY' ? '书记' : '院长' }}:{{ decisionLabel(r.decision) }}
          </span>
          <span v-if="!row.jointReviews?.length" class="muted">未发起</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="360" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/topics/${row.id}`)">详情</el-button>
          <el-button
            v-if="roles.canSubmitReview.value && (row.status === 'DRAFT' || row.status === 'DEFERRED')"
            link
            type="primary"
            @click="submitReview(row)"
          >
            提交双审
          </el-button>
          <el-button
            v-if="roles.canReviewJoint.value && row.status === 'PENDING_REVIEW'"
            link
            type="success"
            @click="review(row, 'APPROVED')"
          >
            同意
          </el-button>
          <el-button
            v-if="roles.canReviewJoint.value && row.status === 'PENDING_REVIEW'"
            link
            type="danger"
            @click="review(row, 'REJECTED')"
          >
            暂缓
          </el-button>
          <el-button
            v-if="roles.canProxyReview.value && row.status === 'PENDING_REVIEW'"
            link
            type="success"
            @click="openProxyReview(row, 'APPROVED')"
          >
            代审通过
          </el-button>
          <el-button
            v-if="roles.canProxyReview.value && row.status === 'PENDING_REVIEW'"
            link
            type="danger"
            @click="openProxyReview(row, 'REJECTED')"
          >
            代审退回
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" title="申报党政联席会议题" width="600px">
      <el-form label-width="120px">
        <el-form-item label="标题">
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.categoryId" style="width: 100%" @change="onCategoryChange">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容摘要">
          <el-input v-model="form.content" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="AI 辅助">
          <el-button :loading="assistLoading" @click="runAssist">根据标题生成建议</el-button>
          <span class="hint">推荐分类、材料与前置标记，须人工确认后提交</span>
        </el-form-item>
        <el-alert
          v-if="assistTip"
          type="success"
          :closable="true"
          show-icon
          style="margin-bottom: 12px"
          :title="assistTip"
          @close="assistTip = ''"
        />
        <el-form-item label="重大事项">
          <el-switch v-model="form.isMajor" />
        </el-form-item>
        <el-form-item label="临时动议">
          <el-switch v-model="form.isTempMotion" />
          <span class="hint">开启后须书记、院长双签，并上传动议说明</span>
        </el-form-item>
        <el-form-item label="紧急临机">
          <el-switch v-model="form.isEmergency" />
          <span class="hint">事后补报联席会，须书记院长双签确认（规则第十三条）</span>
        </el-form-item>
        <el-form-item label="党组织会议前置">
          <el-switch v-model="form.needPartyPrecheck" />
          <span class="hint">重大办学关联事项须先经党组织会议把关</span>
        </el-form-item>
        <el-form-item v-if="form.needPartyPrecheck" label="关联党委决议">
          <el-select
            v-model="form.relatedPartyResolutionId"
            filterable
            clearable
            style="width: 100%"
            placeholder="选择已形成决议的党组织会议议题"
          >
            <el-option
              v-for="p in partyResolved"
              :key="p.resolutionId"
              :label="`${p.title}（${p.resolutionType}）`"
              :value="p.resolutionId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="create">提交</el-button>
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
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'

const router = useRouter()
const roles = useRoles()
const topics = ref<any[]>([])
const categories = ref<any[]>([])
const partyResolved = ref<any[]>([])
const visible = ref(false)
const assistLoading = ref(false)
const assistTip = ref('')
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
const proxyTitle = computed(() =>
  proxyForm.decision === 'REJECTED' ? '代审退回' : '代审通过',
)
const form = reactive({
  title: '',
  content: '',
  categoryId: '',
  isMajor: false,
  isTempMotion: false,
  isEmergency: false,
  needPartyPrecheck: false,
  relatedPartyResolutionId: '',
})

const STATUS_MAP: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待双审',
  DEFERRED: '已暂缓',
  APPROVED: '双审通过',
  ON_AGENDA: '已入议程',
  DISCUSSED: '已讨论',
  RESOLVED: '已决议',
  REJECTED: '未通过',
}

const DECISION_MAP: Record<string, string> = {
  PENDING: '待审',
  APPROVED: '同意',
  REJECTED: '暂缓',
}

function statusLabel(s: string) {
  return STATUS_MAP[s] || s
}
function decisionLabel(s: string) {
  return DECISION_MAP[s] || s
}

async function load() {
  topics.value = await http.get('/topics', {
    params: { meetingType: 'JOINT_CONFERENCE' },
  })
  categories.value = await http.get('/org/categories', {
    params: { meetingType: 'JOINT_CONFERENCE' },
  })
  const partyTopics: any[] = await http.get('/topics', {
    params: { meetingType: 'PARTY_COMMITTEE' },
  })
  partyResolved.value = partyTopics
    .filter((t) => t.resolution?.id)
    .map((t) => ({
      title: t.title,
      resolutionId: t.resolution.id,
      resolutionType: t.resolution.resultType,
    }))
}

function onCategoryChange(id: string) {
  const cat = categories.value.find((c) => c.id === id)
  if (cat?.needPrecheck) {
    form.needPartyPrecheck = true
  }
}

function openCreate() {
  router.push({ name: 'topic-create', query: { meetingType: 'JOINT_CONFERENCE' } })
}

async function runAssist() {
  if (!form.title.trim() || form.title.trim().length < 2) {
    ElMessage.warning('请先填写标题')
    return
  }
  assistLoading.value = true
  try {
    const res: any = await http.post('/ai/assist/create', {
      title: form.title,
      content: form.content,
      meetingType: 'JOINT_CONFERENCE',
    })
    if (res.suggestedCategoryId) {
      form.categoryId = res.suggestedCategoryId
      onCategoryChange(form.categoryId)
    }
    if (res.suggestions?.isMajor) form.isMajor = true
    if (res.suggestions?.isTempMotion) form.isTempMotion = true
    if (res.suggestions?.isEmergency) form.isEmergency = true
    if (res.suggestions?.needPartyPrecheck) form.needPartyPrecheck = true
    const mats = (res.materials || [])
      .filter((m: any) => m.isRequired)
      .map((m: any) => m.name)
      .join('、')
    assistTip.value = [
      res.suggestedCategoryName
        ? `已推荐分类「${res.suggestedCategoryName}」`
        : '未命中强分类，请手动选择',
      mats ? `预计必填材料：${mats}` : '',
      res.narrative || '',
    ]
      .filter(Boolean)
      .join('；')
    ElMessage.success('申报建议已生成，请核对后提交')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    assistLoading.value = false
  }
}

async function create() {
  if (form.needPartyPrecheck && !form.relatedPartyResolutionId) {
    ElMessage.warning('需党组织会议前置时请关联党委决议')
    return
  }
  try {
    const payload: any = {
      title: form.title,
      content: form.content,
      categoryId: form.categoryId || undefined,
      isMajor: form.isMajor,
      isTempMotion: form.isTempMotion,
      isEmergency: form.isEmergency,
      needPartyPrecheck: form.needPartyPrecheck,
      meetingType: 'JOINT_CONFERENCE',
    }
    if (form.needPartyPrecheck) {
      payload.relatedPartyResolutionId = form.relatedPartyResolutionId
    }
    const created: any = await http.post('/topics', payload)
    ElMessage.success(
      form.isEmergency
        ? '紧急临机议题已创建，请上传说明并完成事后双签补确认'
        : form.isTempMotion
          ? '临时动议已创建，请上传材料并完成双签'
          : '议题已创建，请上传材料',
    )
    visible.value = false
    await load()
    router.push(`/topics/${created.id}`)
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
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.tag {
  display: inline-block;
  margin-right: 6px;
  font-size: 12px;
  color: #475569;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
.hint {
  margin-left: 8px;
  color: var(--muted);
  font-size: 12px;
}
</style>
