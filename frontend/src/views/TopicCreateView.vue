<template>
  <div class="create-page" :class="{ embedded }">
    <div v-if="!embedded" class="ui-hero" :class="heroClass">
      <div class="eyebrow"><b></b> {{ heroEyebrow }} · 申报议题</div>
      <h2>申报议题</h2>
      <p>{{ heroDesc }}</p>
    </div>

    <div class="panel">
      <div class="step-label">用于哪类会议</div>
      <p class="hint">可勾选一类或两类。勾选两类时，同一事项会分别写入党组织会议与党政联席会议议题库。</p>
      <div class="checks">
        <label class="check">
          <input v-model="forParty" type="checkbox" />
          党组织会议
        </label>
        <label class="check">
          <input v-model="forJoint" type="checkbox" />
          党政联席会议
        </label>
      </div>
    </div>

    <div v-if="forParty" class="rule-banner party">
      <strong>第一议题硬规则</strong>
      党组织会议必须有一项「第一议题」。请在本页勾选；创建会议时还须再次选定该项入议程。
      <label class="check first-topic-banner">
        <input v-model="isFirstTopic" type="checkbox" />
        本议题为第一议题（政治理论学习）
      </label>
      <p v-if="isFirstTopic" class="hint ok" style="margin: 8px 0 0">
        已标记为第一议题，提交后会写入议题库对应分类。
      </p>
    </div>

    <div v-if="needCollegePick" class="panel">
      <div class="step-label">写入学院</div>
      <p class="hint">当前账号未绑定学院（如校级管理员）。提交议题前请选择学院，否则无法写入议题库。</p>
      <label>
        <span>学院</span>
        <select v-model="selectedCollegeId">
          <option value="">请选择学院</option>
          <option v-for="c in colleges" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </label>
    </div>

    <div class="panel">
      <div class="step-label">1 · 事项描述</div>
      <label>
        <span>用几句话说明要提什么议题</span>
        <textarea
          v-model="description"
          rows="5"
          placeholder="例如：拟引进两名密码方向学科带头人，需要配套安家费与团队启动经费，请纳入近期联席会议题。"
        />
      </label>
      <button
        class="ui-btn"
        :class="forParty && !forJoint ? 'party' : ''"
        type="button"
        style="width: 100%; height: 42px"
        :disabled="assistLoading"
        @click="runAssist"
      >
        {{ assistLoading ? '生成中，请稍候…' : 'AI 辅助生成标题 / 内容 / 分类' }}
      </button>
      <p v-if="assistHint" class="hint" :class="{ warn: assistFailed }">{{ assistHint }}</p>
      <button class="ui-btn light" type="button" style="width: 100%; height: 42px; margin-top: 8px" @click="skipAssist">
        跳过 AI，直接填写
      </button>
    </div>

    <div ref="resultEl" class="panel">
      <div class="step-label">2 · 人工核对与修改</div>
      <p class="hint">请仔细阅读并修改下方内容，确认无误后再提交到议题库。AI 不自动创建、不替代审签。</p>
      <div v-if="assistNarrative" class="assist-note">
        <strong>生成说明</strong>
        <pre>{{ assistNarrative }}</pre>
      </div>

      <label>
        <span>议题标题</span>
        <input v-model="form.title" placeholder="议题标题（至少 2 字）" />
      </label>
      <label>
        <span>议题内容</span>
        <textarea v-model="form.content" rows="12" placeholder="背景、依据与拟议事项" />
      </label>

      <div v-if="forParty" class="checks" style="margin-bottom: 12px">
        <label class="check">
          <input v-model="isFirstTopic" type="checkbox" />
          本议题为第一议题（政治理论学习）
        </label>
      </div>
      <p v-if="forParty && isFirstTopic" class="hint ok">已标记为第一议题，创建党组织会议时须勾选该项。</p>

      <label v-if="forParty">
        <span>{{ forJoint ? '党组织会议分类' : '议题分类' }}</span>
        <select v-model="form.partyCategoryId">
          <option value="">请选择</option>
          <option v-for="c in partyCategories" :key="c.id" :value="c.id">
            {{ c.code === 'FIRST_TOPIC' ? `第一议题 · ${c.name}` : c.name }}
          </option>
        </select>
      </label>

      <label v-if="forJoint">
        <span>{{ forParty ? '党政联席会议分类' : '议题分类' }}</span>
        <select v-model="form.jointCategoryId" @change="onJointCategoryChange">
          <option value="">请选择</option>
          <option v-for="c in jointCategories" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </label>

      <div class="checks">
        <label class="check"><input v-model="form.isMajor" type="checkbox" /> 重大事项</label>
        <label class="check"><input v-model="form.isTempMotion" type="checkbox" /> 临时动议</label>
        <label v-if="forJoint" class="check">
          <input v-model="form.isEmergency" type="checkbox" /> 紧急临机
        </label>
        <label v-if="forJoint" class="check">
          <input v-model="form.needPartyPrecheck" type="checkbox" /> 需党组织会议前置
        </label>
      </div>

      <label v-if="forJoint && form.needPartyPrecheck">
        <span>关联党委决议</span>
        <select v-model="form.relatedPartyResolutionId">
          <option value="">请选择</option>
          <option v-for="r in partyResolved" :key="r.resolutionId" :value="r.resolutionId">
            {{ r.title }}
          </option>
        </select>
      </label>

      <div class="actions">
        <button class="ui-btn light" type="button" @click="onCancel">{{ embedded ? '返回列表' : '取消' }}</button>
        <button
          class="ui-btn"
          :class="forParty && !forJoint ? 'party' : ''"
          type="button"
          :disabled="saving"
          @click="submitToLibrary"
        >
          {{ submitLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useAuthStore } from '@/stores/auth'

interface CategoryItem {
  id: string
  name: string
  code?: string
  needPrecheck?: boolean
}

type MeetingKind = 'PARTY_COMMITTEE' | 'JOINT_CONFERENCE'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const props = withDefaults(
  defineProps<{
    embedded?: boolean
  }>(),
  { embedded: false },
)
const emit = defineEmits<{
  submitted: []
  cancel: []
}>()

const queryType = String(route.query.meetingType || '')
const forParty = ref(queryType === 'PARTY_COMMITTEE')
const forJoint = ref(queryType === 'JOINT_CONFERENCE')

const bothSelected = computed(() => forParty.value && forJoint.value)
const anySelected = computed(() => forParty.value || forJoint.value)

const heroClass = computed(() => {
  if (bothSelected.value || !anySelected.value) return 'is-official'
  return forParty.value ? 'party' : 'joint'
})
const heroEyebrow = computed(() => {
  if (bothSelected.value || !anySelected.value) return '议题办理'
  return forParty.value ? '党委红轨' : '联席蓝轨'
})
const heroDesc = computed(() => {
  if (!anySelected.value) return '请先勾选本议题用于哪类会议，可同时用于党组织会议和党政联席会议。'
  if (bothSelected.value) {
    return '同一事项将分别写入两类会议议题库。党组织会议须有「第一议题」方可开会；联席会议题按双审规则办理。'
  }
  if (forParty.value) {
    return '党组织会议须有「第一议题（政治理论学习）」入议程后方可开会。可先勾选下方第一议题，再描述事项；AI 辅助可选。'
  }
  return '先用自然语言描述事项，也可直接填写标题与内容；核对后提交进入议题库。'
})
const submitLabel = computed(() => {
  if (saving.value) return '提交中…'
  if (bothSelected.value) return '分别提交到两类议题库'
  return '提交到议题库'
})

const partyCategories = ref<CategoryItem[]>([])
const jointCategories = ref<CategoryItem[]>([])
const colleges = ref<Array<{ id: string; name: string }>>([])
const selectedCollegeId = ref('')
const needCollegePick = computed(() => !auth.user?.collegeId)
const partyResolved = ref<Array<{ title: string; resolutionId: string }>>([])
const assistLoading = ref(false)
const assistHint = ref('')
const assistFailed = ref(false)
const assistNarrative = ref('')
const resultEl = ref<HTMLElement | null>(null)
const saving = ref(false)
const description = ref('')

const form = reactive({
  title: '',
  content: '',
  partyCategoryId: '',
  jointCategoryId: '',
  isMajor: false,
  isTempMotion: false,
  isEmergency: false,
  needPartyPrecheck: false,
  relatedPartyResolutionId: '',
})

const firstTopicCategory = computed(() =>
  partyCategories.value.find((c) => c.code === 'FIRST_TOPIC'),
)
const isFirstTopicCategory = computed(() => {
  const cat = partyCategories.value.find((c) => c.id === form.partyCategoryId)
  return cat?.code === 'FIRST_TOPIC'
})
const isFirstTopic = computed({
  get: () => isFirstTopicCategory.value,
  set: (checked: boolean) => {
    if (checked) {
      if (firstTopicCategory.value) form.partyCategoryId = firstTopicCategory.value.id
      else ElMessage.warning('系统未配置第一议题分类，请联系管理员')
    } else if (isFirstTopicCategory.value) {
      form.partyCategoryId = ''
    }
  },
})

function onJointCategoryChange() {
  const cat = jointCategories.value.find((c) => c.id === form.jointCategoryId)
  if (cat?.needPrecheck) form.needPartyPrecheck = true
}

async function loadColleges() {
  if (!needCollegePick.value || colleges.value.length) return
  colleges.value = await http.get('/org/colleges')
  if (!selectedCollegeId.value && colleges.value.length === 1) {
    selectedCollegeId.value = colleges.value[0].id
  }
}

async function loadPartyMeta() {
  partyCategories.value = await http.get('/org/categories', {
    params: { meetingType: 'PARTY_COMMITTEE' },
  })
}

async function loadJointMeta() {
  jointCategories.value = await http.get('/org/categories', {
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
    }))
}

async function runAssistFor(meetingType: MeetingKind) {
  return http.post(
    '/ai/assist/create',
    {
      description: description.value.trim(),
      meetingType,
    },
    { timeout: 90000 },
  ) as Promise<any>
}

function applyAssistResult(res: any, meetingType: MeetingKind) {
  const title = String(res?.suggestedTitle || '').trim()
  const content = String(res?.suggestedContent || '').trim()
  if (title) form.title = title
  if (content) form.content = content
  if (meetingType === 'PARTY_COMMITTEE') {
    form.partyCategoryId =
      res?.suggestedCategoryId || form.partyCategoryId || partyCategories.value[0]?.id || ''
  } else {
    form.jointCategoryId =
      res?.suggestedCategoryId || form.jointCategoryId || jointCategories.value[0]?.id || ''
    onJointCategoryChange()
  }
  if (res?.suggestions?.isMajor) form.isMajor = true
  if (res?.suggestions?.isTempMotion) form.isTempMotion = true
  if (meetingType === 'JOINT_CONFERENCE') {
    if (res?.suggestions?.isEmergency) form.isEmergency = true
    if (res?.suggestions?.needPartyPrecheck) form.needPartyPrecheck = true
  }
  assistNarrative.value = String(res?.narrative || res?.outputText || '').trim()
}

async function runAssist() {
  assistFailed.value = false
  assistHint.value = ''
  if (!description.value.trim() || description.value.trim().length < 2) {
    assistFailed.value = true
    assistHint.value = '请先用几句话描述要提的议题'
    ElMessage.warning(assistHint.value)
    return
  }
  if (!anySelected.value) {
    forJoint.value = true
    assistHint.value = '未勾选会议类型，已默认按党政联席会议生成，可再勾选党组织会议。'
  }
  assistLoading.value = true
  assistHint.value = assistHint.value || '正在调用大模型起草标题与正文，大约需要几秒…'
  try {
    if (forParty.value) await loadPartyMeta()
    if (forJoint.value) await loadJointMeta()
    const primary: MeetingKind = forParty.value ? 'PARTY_COMMITTEE' : 'JOINT_CONFERENCE'
    const res = await runAssistFor(primary)
    applyAssistResult(res, primary)
    if (bothSelected.value && primary !== 'JOINT_CONFERENCE') {
      const jointRes = await runAssistFor('JOINT_CONFERENCE')
      applyAssistResult(jointRes, 'JOINT_CONFERENCE')
    }
    if (!form.title.trim() && !form.content.trim()) {
      skipAssist()
    }
    assistHint.value = '已生成建议稿，请在下方核对标题、内容与分类后再提交。'
    ElMessage.success('已生成建议稿，请向下核对后提交')
    await nextTick()
    resultEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (e: any) {
    assistFailed.value = true
    assistHint.value = String(e || '生成失败，请稍后重试，或点「跳过 AI，直接填写」')
    ElMessage.error(assistHint.value)
  } finally {
    assistLoading.value = false
  }
}

function skipAssist() {
  const text = description.value.trim()
  if (text) {
    if (!form.title.trim()) {
      form.title = text.split('\n')[0].slice(0, 40)
    }
    if (!form.content.trim()) {
      form.content = text
    }
  }
}

function basePayload() {
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    content: form.content.trim(),
    isMajor: form.isMajor,
    isTempMotion: form.isTempMotion,
  }
  if (needCollegePick.value) payload.collegeId = selectedCollegeId.value
  return payload
}

function resetDraft() {
  description.value = ''
  assistHint.value = ''
  assistFailed.value = false
  assistNarrative.value = ''
  form.title = ''
  form.content = ''
  form.partyCategoryId = ''
  form.jointCategoryId = ''
  form.isMajor = false
  form.isTempMotion = false
  form.isEmergency = false
  form.needPartyPrecheck = false
  form.relatedPartyResolutionId = ''
}

async function submitToLibrary() {
  if (!anySelected.value) {
    ElMessage.warning('请先勾选本议题用于哪类会议')
    return
  }
  if (needCollegePick.value && !selectedCollegeId.value) {
    ElMessage.warning('请先选择要写入的学院')
    return
  }
  if (!form.title.trim() || form.title.trim().length < 2) {
    ElMessage.warning('请确认议题标题（至少 2 字）')
    return
  }
  if (!form.content.trim()) {
    ElMessage.warning('请确认议题内容')
    return
  }
  if (forParty.value && !form.partyCategoryId) {
    ElMessage.warning(
      isFirstTopic.value ? '请勾选「本议题为第一议题」，或选择党组织会议分类' : '请选择党组织会议分类',
    )
    return
  }
  if (forJoint.value && !form.jointCategoryId) {
    ElMessage.warning('请选择党政联席会议分类')
    return
  }
  if (forJoint.value && form.needPartyPrecheck && !form.relatedPartyResolutionId) {
    ElMessage.warning('需党组织会议前置时请关联党委决议')
    return
  }
  saving.value = true
  try {
    const jobs: Promise<unknown>[] = []
    if (forParty.value) {
      jobs.push(
        http.post('/topics', {
          ...basePayload(),
          meetingType: 'PARTY_COMMITTEE',
          categoryId: form.partyCategoryId,
        }),
      )
    }
    if (forJoint.value) {
      const jointPayload: Record<string, unknown> = {
        ...basePayload(),
        meetingType: 'JOINT_CONFERENCE',
        categoryId: form.jointCategoryId,
        isEmergency: form.isEmergency,
        needPartyPrecheck: form.needPartyPrecheck,
      }
      if (form.needPartyPrecheck) {
        jointPayload.relatedPartyResolutionId = form.relatedPartyResolutionId
      }
      jobs.push(http.post('/topics', jointPayload))
    }
    await Promise.all(jobs)
    ElMessage.success(bothSelected.value ? '已分别写入两类议题库' : '已进入议题库')
    if (props.embedded) {
      resetDraft()
      emit('submitted')
    } else {
      router.push({ path: '/topics', query: { mine: '1' } })
    }
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    saving.value = false
  }
}

function onCancel() {
  if (props.embedded) emit('cancel')
  else router.back()
}

watch(forParty, async (on) => {
  if (on) await loadPartyMeta()
  else {
    form.partyCategoryId = ''
    partyCategories.value = []
  }
})

watch(forJoint, async (on) => {
  if (on) await loadJointMeta()
  else {
    form.jointCategoryId = ''
    form.isEmergency = false
    form.needPartyPrecheck = false
    form.relatedPartyResolutionId = ''
    jointCategories.value = []
    partyResolved.value = []
  }
})

onMounted(async () => {
  await loadColleges()
  if (forParty.value) await loadPartyMeta()
  if (forJoint.value) await loadJointMeta()
})
</script>

<style scoped>
.rule-banner {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff7f4;
  border: 1px solid #f1c6bb;
  font-size: 13px;
  line-height: 1.55;
}
.rule-banner strong {
  display: block;
  margin-bottom: 2px;
}
.first-topic-banner {
  margin-top: 10px;
  font-weight: 600;
}
.hint.ok {
  color: #166534;
}
.hint.warn {
  color: #9a3412;
}
.assist-note {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f4f8fc;
  border: 1px solid #d7e4f2;
  font-size: 13px;
  line-height: 1.5;
}
.assist-note strong {
  display: block;
  margin-bottom: 4px;
}
.assist-note pre {
  margin: 0;
  white-space: pre-wrap;
  font: inherit;
  color: #334155;
}
.create-page.embedded {
  margin-top: 0;
}
.panel {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}

.step-label {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--text);
}

.hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.45;
}

label {
  display: block;
  margin-bottom: 12px;
}

label > span {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  background: #f7f9fc;
  outline: none;
}

textarea {
  resize: vertical;
}

.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 12px;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin: 0;
}

.check input {
  width: auto;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}
</style>
