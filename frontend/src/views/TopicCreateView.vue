<template>
  <div class="create-page">
    <div class="ui-hero" :class="isParty ? 'party' : 'joint'">
      <div class="eyebrow"><b></b> {{ isParty ? '党委红轨' : '联席蓝轨' }} · 议题征集</div>
      <h2>议题征集</h2>
      <p>
        {{
          isParty
            ? '党组织会议须有「第一议题（政治理论学习）」入议程后方可开会。先描述事项，AI 辅助生成后请人工核对。'
            : '先用自然语言描述事项，AI 辅助生成标题、内容与分类；人工核对后提交进入议题库。'
        }}
      </p>
    </div>

    <div v-if="isParty" class="rule-banner party">
      <strong>第一议题硬规则</strong>
      分类请优先选「第一议题（政治理论学习）」。没有第一议题的党组织会议不能创建、不能开会。
    </div>

    <!-- 步骤 1：描述 -->
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
        :class="isParty ? 'party' : ''"
        type="button"
        style="width: 100%; height: 42px"
        :disabled="assistLoading"
        @click="runAssist"
      >
        {{ assistLoading ? '生成中…' : 'AI 辅助生成标题 / 内容 / 分类' }}
      </button>
    </div>

    <!-- 步骤 2：人工核对 -->
    <div v-if="draftReady" class="panel">
      <div class="step-label">2 · 人工核对与修改</div>
      <p class="hint">请仔细阅读并修改下方内容，确认无误后再提交到议题库。AI 不自动创建、不替代审签。</p>

      <label>
        <span>议题标题</span>
        <input v-model="form.title" placeholder="议题标题（至少 2 字）" />
      </label>
      <label>
        <span>议题内容</span>
        <textarea v-model="form.content" rows="12" placeholder="背景、依据与拟议事项" />
      </label>
      <label>
        <span>议题分类</span>
        <select v-model="form.categoryId" @change="onCategoryChange">
          <option value="">请选择</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">
            {{ c.code === 'FIRST_TOPIC' ? `第一议题 · ${c.name}` : c.name }}
          </option>
        </select>
        <p v-if="isParty && isFirstTopicCategory" class="hint ok">当前分类为第一议题。</p>
        <p v-else-if="isParty" class="hint warn">
          党组织会议须有「第一议题（政治理论学习）」入议程后方可开会。若本次不是第一议题，请确保议题库里另有已审过的第一议题。
        </p>
      </label>

      <div class="checks">
        <label class="check"><input v-model="form.isMajor" type="checkbox" /> 重大事项</label>
        <label class="check"><input v-model="form.isTempMotion" type="checkbox" /> 临时动议</label>
        <label class="check"><input v-model="form.isEmergency" type="checkbox" /> 紧急临机</label>
        <label v-if="!isParty" class="check">
          <input v-model="form.needPartyPrecheck" type="checkbox" /> 需党组织会议前置
        </label>
      </div>

      <label v-if="!isParty && form.needPartyPrecheck">
        <span>关联党委决议</span>
        <select v-model="form.relatedPartyResolutionId">
          <option value="">请选择</option>
          <option v-for="r in partyResolved" :key="r.resolutionId" :value="r.resolutionId">
            {{ r.title }}
          </option>
        </select>
      </label>

      <div class="actions">
        <button class="ui-btn light" type="button" @click="router.back()">取消</button>
        <button
          class="ui-btn"
          :class="isParty ? 'party' : ''"
          type="button"
          :disabled="saving"
          @click="submitToLibrary"
        >
          {{ saving ? '提交中…' : '提交到议题库' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'

const route = useRoute()
const router = useRouter()

const meetingType = computed(() =>
  String(route.query.meetingType || 'JOINT_CONFERENCE') === 'PARTY_COMMITTEE'
    ? 'PARTY_COMMITTEE'
    : 'JOINT_CONFERENCE',
)
const isParty = computed(() => meetingType.value === 'PARTY_COMMITTEE')
const isFirstTopicCategory = computed(() => {
  const cat = categories.value.find((c) => c.id === form.categoryId)
  return cat?.code === 'FIRST_TOPIC'
})

const categories = ref<any[]>([])
const partyResolved = ref<Array<{ title: string; resolutionId: string }>>([])
const assistLoading = ref(false)
const saving = ref(false)
const assist = ref<any>(null)
const draftReady = ref(false)
const description = ref('')

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

function onCategoryChange() {
  const cat = categories.value.find((c) => c.id === form.categoryId)
  if (cat?.needPrecheck) form.needPartyPrecheck = true
}

function resetFormFlags() {
  form.isMajor = false
  form.isTempMotion = false
  form.isEmergency = false
  form.needPartyPrecheck = false
  form.relatedPartyResolutionId = ''
}

async function loadMeta() {
  categories.value = await http.get('/org/categories', {
    params: { meetingType: meetingType.value },
  })
  if (isParty.value && !form.categoryId) {
    const first = categories.value.find((c) => c.code === 'FIRST_TOPIC')
    if (first) form.categoryId = first.id
  }
  if (!isParty.value) {
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
}

async function runAssist() {
  if (!description.value.trim() || description.value.trim().length < 4) {
    ElMessage.warning('请先用几句话描述要提的议题（至少 4 字）')
    return
  }
  assistLoading.value = true
  try {
    const res: any = await http.post('/ai/assist/create', {
      description: description.value.trim(),
      meetingType: meetingType.value,
    })
    assist.value = res
    form.title = res.suggestedTitle || form.title
    form.content = res.suggestedContent || form.content
    if (res.suggestedCategoryId) {
      form.categoryId = res.suggestedCategoryId
      onCategoryChange()
    } else if (!form.categoryId) {
      form.categoryId = categories.value[0]?.id || ''
    }
    resetFormFlags()
    if (res.suggestions?.isMajor) form.isMajor = true
    if (res.suggestions?.isTempMotion) form.isTempMotion = true
    if (res.suggestions?.isEmergency) form.isEmergency = true
    if (res.suggestions?.needPartyPrecheck) form.needPartyPrecheck = true
    draftReady.value = true
    ElMessage.success('已生成建议稿，请人工核对后提交')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    assistLoading.value = false
  }
}

async function submitToLibrary() {
  if (!form.title.trim() || form.title.trim().length < 2) {
    ElMessage.warning('请确认议题标题（至少 2 字）')
    return
  }
  if (!form.content.trim()) {
    ElMessage.warning('请确认议题内容')
    return
  }
  if (!form.categoryId) {
    ElMessage.warning('请选择议题分类')
    return
  }
  if (!isParty.value && form.needPartyPrecheck && !form.relatedPartyResolutionId) {
    ElMessage.warning('需党组织会议前置时请关联党委决议')
    return
  }
  saving.value = true
  try {
    const payload: any = {
      title: form.title.trim(),
      content: form.content.trim(),
      categoryId: form.categoryId || undefined,
      isMajor: form.isMajor,
      isTempMotion: form.isTempMotion,
      isEmergency: form.isEmergency,
      needPartyPrecheck: form.needPartyPrecheck,
      meetingType: meetingType.value,
    }
    if (!isParty.value && form.needPartyPrecheck) {
      payload.relatedPartyResolutionId = form.relatedPartyResolutionId
    }
    const created: any = await http.post('/topics', payload)
    ElMessage.success('已进入议题库')
    router.push({
      name: isParty.value ? 'party-topics' : 'topics',
    })
    // 也可进详情完善材料
    void created
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    saving.value = false
  }
}

watch(meetingType, () => {
  assist.value = null
  draftReady.value = false
  description.value = ''
  form.title = ''
  form.content = ''
  form.categoryId = ''
  resetFormFlags()
  loadMeta()
})

onMounted(loadMeta)
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
.hint.ok {
  color: #166534;
}
.hint.warn {
  color: #9a3412;
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
