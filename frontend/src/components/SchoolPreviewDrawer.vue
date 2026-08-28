<template>
  <div v-if="open" class="pv-mask" @click.self="emit('close')">
    <aside class="pv-panel" role="dialog" :aria-label="kind === 'meeting' ? '会议预览' : '议题预览'">
      <header class="pv-head">
        <div>
          <h3>{{ kind === 'meeting' ? '会议预览' : '议题预览' }}</h3>
          <p>{{ subtitle }}</p>
        </div>
        <button type="button" class="pv-close" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="pv-body">
        <button v-if="canBack" type="button" class="pv-back" @click="goBack">← 返回上一层</button>

        <div v-if="loading" class="pv-empty">加载中…</div>
        <div v-else-if="error" class="pv-empty">{{ error }}</div>

        <template v-else-if="kind === 'meeting' && meeting">
          <div class="pv-tags">
            <span class="ui-tag" :class="meeting.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint'">
              {{ meeting.meetingType === 'PARTY_COMMITTEE' ? '党委会' : '党政联席会议' }}
            </span>
            <span class="ui-tag">{{ statusLabel(meeting.status, 'meeting') }}</span>
          </div>
          <h4 class="pv-title">{{ meeting.title }}</h4>
          <p class="pv-meta">
            {{ meeting.college?.name || '—' }} ·
            {{ formatTime(meeting.scheduledAt || meeting.createdAt) }} · 议题
            {{ meeting.topics?.length || 0 }} 项
          </p>

          <div class="pv-sec">
            <h5>会议议题</h5>
            <ol v-if="meeting.topics?.length" class="pv-topics">
              <li v-for="(t, idx) in meeting.topics" :key="t.id">
                <button type="button" class="pv-topic" @click="openTopic(t.id)">
                  <span class="idx">{{ Number(idx) + 1 }}.</span>
                  <span v-if="t.category?.name" class="cat">{{ t.category.name }}</span>
                  <span class="ttl">{{ t.title }}</span>
                </button>
              </li>
            </ol>
            <p v-else class="pv-muted">暂无议题</p>
          </div>
        </template>

        <template v-else-if="kind === 'topic' && topic">
          <div class="pv-tags">
            <span
              class="ui-tag"
              :class="topic.meetingType === 'PARTY_COMMITTEE' ? 'party' : 'joint'"
            >
              {{ topic.meetingType === 'PARTY_COMMITTEE' ? '党委会' : '党政联席会议' }}
            </span>
            <span class="ui-tag">{{ statusLabel(topic.status, 'topic') }}</span>
            <span v-if="topic.category?.name" class="ui-tag">{{ topic.category.name }}</span>
          </div>
          <h4 class="pv-title">{{ topic.title }}</h4>
          <p class="pv-meta">
            申报人 {{ topic.proposer?.realName || '—' }}
            <template v-if="topic.meeting?.title"> · 关联会议 {{ topic.meeting.title }}</template>
          </p>
          <div class="pv-sec">
            <h5>议题内容</h5>
            <div
              v-if="topic.content?.trim()"
              class="pv-content rich"
              v-html="renderContentHtml(topic.content)"
            />
            <p v-else class="pv-content">暂无正文</p>
          </div>
          <div v-if="topic.materials?.length" class="pv-sec">
            <h5>材料（{{ topic.materials.length }}）</h5>
            <ul class="pv-mats">
              <li v-for="m in topic.materials" :key="m.id">{{ m.originalName || m.name || '附件' }}</li>
            </ul>
          </div>
          <div v-if="topic.resolution" class="pv-sec">
            <h5>决议</h5>
            <p class="pv-content">
              {{ resolutionLabel(topic.resolution.resultType) }}
              <template v-if="topic.resolution.content">
                — {{ topic.resolution.content }}
              </template>
            </p>
          </div>
        </template>
      </div>

      <footer class="pv-foot">
        <button type="button" class="ui-btn light" @click="emit('close')">关闭</button>
        <button type="button" class="ui-btn" @click="openFull">完整页面</button>
      </footer>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import http from '@/api/http'
import { renderContentHtml } from '@/utils/markdown'

type Kind = 'meeting' | 'topic'

const props = defineProps<{
  open: boolean
  kind: Kind
  id: string
}>()

const emit = defineEmits<{
  close: []
  'update:kind': [Kind]
  'update:id': [string]
}>()

const router = useRouter()
const loading = ref(false)
const error = ref('')
const meeting = ref<any>(null)
const topic = ref<any>(null)
const stack = ref<Array<{ kind: Kind; id: string }>>([])

const MEETING_STATUS: Record<string, string> = {
  DRAFT: '草稿',
  SCHEDULED: '已排期',
  IN_PROGRESS: '进行中',
  ENDED: '已结束',
  RESOLVED: '已决议',
  ARCHIVED: '已归档',
}

const TOPIC_STATUS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审',
  DEFERRED: '已暂缓',
  APPROVED: '已通过',
  ON_AGENDA: '已入会',
  DISCUSSED: '待再议',
  RESOLVED: '已决议',
  REJECTED: '未通过',
}

const RESOLUTION: Record<string, string> = {
  APPROVED: '通过',
  PRINCIPLE_APPROVED: '原则通过',
  DEFERRED: '暂缓',
  REJECTED: '未通过',
}

const subtitle = computed(() => {
  if (props.kind === 'meeting') return meeting.value?.college?.name || '会议详情'
  return topic.value?.category?.name || '议题详情'
})

const canBack = computed(() => stack.value.length > 0)

function statusLabel(s: string, kind: Kind) {
  return (kind === 'meeting' ? MEETING_STATUS : TOPIC_STATUS)[s] || s
}

function resolutionLabel(s?: string) {
  if (!s) return '—'
  return RESOLUTION[s] || s
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function load() {
  if (!props.open || !props.id) return
  loading.value = true
  error.value = ''
  meeting.value = null
  topic.value = null
  try {
    if (props.kind === 'meeting') {
      meeting.value = await http.get(`/meetings/${props.id}`)
    } else {
      topic.value = await http.get(`/topics/${props.id}`)
    }
  } catch (e: any) {
    error.value = e?.response?.data?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function openTopic(id: string) {
  stack.value = [...stack.value, { kind: props.kind, id: props.id }]
  emit('update:kind', 'topic')
  emit('update:id', id)
}

function goBack() {
  const prev = stack.value[stack.value.length - 1]
  if (!prev) return
  stack.value = stack.value.slice(0, -1)
  emit('update:kind', prev.kind)
  emit('update:id', prev.id)
}

function openFull() {
  const path =
    props.kind === 'meeting' ? `/meetings/${props.id}` : `/topics/${props.id}`
  emit('close')
  router.push({ path, query: { from: 'school' } })
}

watch(
  () => [props.open, props.kind, props.id] as const,
  ([open]) => {
    if (!open) {
      stack.value = []
      meeting.value = null
      topic.value = null
      error.value = ''
      return
    }
    load()
  },
  { immediate: true },
)
</script>

<style scoped>
.pv-mask {
  position: fixed;
  inset: 0;
  z-index: 85;
  background: rgba(15, 35, 60, 0.35);
  display: flex;
  justify-content: flex-end;
}
.pv-panel {
  width: min(480px, 100%);
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 28px rgba(15, 53, 95, 0.18);
}
.pv-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid #eef2f7;
  flex-shrink: 0;
}
.pv-head h3 {
  margin: 0;
  font-size: 17px;
}
.pv-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.pv-close {
  border: none;
  background: #f1f4f9;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--muted);
}
.pv-body {
  flex: 1;
  overflow: auto;
  padding: 14px 16px;
  -webkit-overflow-scrolling: touch;
}
.pv-back {
  border: none;
  background: transparent;
  color: var(--joint);
  font: inherit;
  font-weight: 600;
  padding: 0 0 12px;
  cursor: pointer;
}
.pv-empty {
  color: var(--muted);
  text-align: center;
  padding: 40px 8px;
}
.pv-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.pv-title {
  margin: 0 0 8px;
  font-size: 18px;
  line-height: 1.35;
}
.pv-meta {
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 13px;
}
.pv-sec {
  margin-bottom: 16px;
}
.pv-sec h5 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--muted);
}
.pv-content {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 14px;
}
.pv-content.rich {
  white-space: normal;
  word-break: break-word;
}
.pv-content.rich :deep(p) {
  margin: 0 0 0.55em;
}
.pv-content.rich :deep(p:last-child) {
  margin-bottom: 0;
}
.pv-content.rich :deep(ul),
.pv-content.rich :deep(ol) {
  margin: 0.35em 0 0.55em;
  padding-left: 1.35em;
}
.pv-muted {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
.pv-topics {
  list-style: none;
  margin: 0;
  padding: 0;
}
.pv-topics li {
  margin: 0 0 6px;
}
.pv-topic {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  text-align: left;
  border: 1px solid #e8edf3;
  background: #f7f9fc;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  cursor: pointer;
  color: var(--joint);
}
.pv-topic:hover {
  background: #eef3fa;
}
.pv-topic .idx {
  color: var(--muted);
  flex-shrink: 0;
}
.pv-topic .cat {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  background: #eef2f7;
  border-radius: 6px;
  padding: 1px 6px;
}
.pv-topic .ttl {
  min-width: 0;
  line-height: 1.4;
}
.pv-mats {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text);
}
.pv-foot {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid #eef2f7;
}
</style>
