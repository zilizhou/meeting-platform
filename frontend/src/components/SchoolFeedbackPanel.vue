<template>
  <div v-if="open" class="fb-mask" @click.self="emit('close')">
    <aside class="fb-panel" role="dialog" aria-label="部门反馈">
      <header class="fb-head">
        <div>
          <h3>部门反馈</h3>
          <p>{{ collegeName || '—' }}</p>
        </div>
        <button type="button" class="fb-close" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div v-if="!activeId" class="fb-body">
        <div v-if="loading" class="fb-empty">加载中…</div>
        <div v-else-if="!threads.length" class="fb-empty">暂无反馈往来</div>
        <button
          v-for="t in threads"
          :key="t.id"
          type="button"
          class="fb-thread"
          @click="openThread(t.id)"
        >
          <strong>{{ t.subject || '反馈' }}</strong>
          <em>{{ preview(t.lastMessage?.content) }}</em>
          <span>{{ formatTime(t.lastMessageAt) }} · {{ t.messageCount }} 条</span>
        </button>
      </div>

      <div v-else class="fb-body is-chat">
        <button type="button" class="fb-back" @click="activeId = ''; detail = null">
          ← 返回列表
        </button>
        <div v-if="detailLoading" class="fb-empty">加载中…</div>
        <template v-else-if="detail">
          <div class="fb-subject">{{ detail.subject || '反馈往来' }}</div>
          <div class="fb-msgs">
            <div
              v-for="m in detail.messages"
              :key="m.id"
              class="fb-msg"
              :class="m.fromSchool ? 'school' : 'college'"
            >
              <header>
                <b>{{ m.author.realName }}</b>
                <span>{{ m.fromSchool ? '校级' : '学院' }} · {{ formatTime(m.createdAt) }}</span>
              </header>
              <p>{{ m.content }}</p>
            </div>
          </div>
        </template>
      </div>

      <footer class="fb-foot">
        <textarea
          v-model="draft"
          rows="3"
          :placeholder="activeId ? '回复…' : canCreate ? '写一条反馈给该部门…' : '选择线程后回复…'"
          :disabled="!canCompose"
        />
        <button
          type="button"
          class="ui-btn"
          :disabled="sending || !draft.trim() || !canCompose"
          @click="send"
        >
          {{ sending ? '发送中…' : activeId ? '回复' : '发送反馈' }}
        </button>
      </footer>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import http from '@/api/http'

interface ThreadRow {
  id: string
  subject?: string | null
  lastMessageAt: string
  messageCount: number
  lastMessage?: { content: string } | null
}

interface ThreadDetail {
  id: string
  subject?: string | null
  messages: Array<{
    id: string
    content: string
    createdAt: string
    fromSchool: boolean
    author: { id: string; realName: string }
  }>
}

const props = defineProps<{
  open: boolean
  collegeId: string
  collegeName?: string
  /** 校级可新建；院方只能回复已有线程 */
  canCreate?: boolean
  initialThreadId?: string
}>()

const emit = defineEmits<{ close: [] }>()

const loading = ref(false)
const detailLoading = ref(false)
const sending = ref(false)
const threads = ref<ThreadRow[]>([])
const activeId = ref('')
const detail = ref<ThreadDetail | null>(null)
const draft = ref('')

const canCompose = computed(() => {
  if (activeId.value) return true
  return !!props.canCreate && !!props.collegeId
})

watch(
  () => [props.open, props.collegeId, props.initialThreadId] as const,
  async ([open, collegeId, initial]) => {
    if (!open) return
    draft.value = ''
    if (initial) {
      await openThread(initial)
      return
    }
    activeId.value = ''
    detail.value = null
    if (collegeId) await loadThreads()
  },
  { immediate: true },
)

async function loadThreads() {
  loading.value = true
  try {
    const res: any = await http.get('/feedback', {
      params: { collegeId: props.collegeId || undefined },
    })
    threads.value = res.items || []
  } finally {
    loading.value = false
  }
}

async function openThread(id: string) {
  activeId.value = id
  detailLoading.value = true
  try {
    detail.value = await http.get(`/feedback/${id}`)
  } finally {
    detailLoading.value = false
  }
}

async function send() {
  const content = draft.value.trim()
  if (!content || !canCompose.value) return
  sending.value = true
  try {
    if (activeId.value) {
      detail.value = await http.post(`/feedback/${activeId.value}/messages`, { content })
    } else {
      const created: any = await http.post('/feedback', {
        collegeId: props.collegeId,
        content,
      })
      detail.value = created
      activeId.value = created.id
      await loadThreads()
    }
    draft.value = ''
  } finally {
    sending.value = false
  }
}

function preview(text?: string) {
  if (!text) return '暂无内容'
  return text.length > 48 ? `${text.slice(0, 48)}…` : text
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<style scoped>
.fb-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(15, 35, 60, 0.35);
  display: flex;
  justify-content: flex-end;
}
.fb-panel {
  width: min(420px, 100%);
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 28px rgba(15, 53, 95, 0.18);
}
.fb-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid #eef2f7;
}
.fb-head h3 {
  margin: 0;
  font-size: 17px;
}
.fb-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.fb-close {
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
.fb-body {
  flex: 1;
  overflow: auto;
  padding: 12px 14px;
}
.fb-empty {
  color: var(--muted);
  text-align: center;
  padding: 28px 8px;
  font-size: 14px;
}
.fb-thread {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid #e8edf3;
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}
.fb-thread strong {
  display: block;
  font-size: 14px;
  margin-bottom: 4px;
}
.fb-thread em {
  display: block;
  font-style: normal;
  color: var(--text);
  font-size: 13px;
  margin-bottom: 6px;
}
.fb-thread span {
  color: var(--muted);
  font-size: 12px;
}
.fb-back {
  border: none;
  background: transparent;
  color: var(--joint);
  font: inherit;
  font-weight: 600;
  padding: 0 0 10px;
  cursor: pointer;
}
.fb-subject {
  font-weight: 700;
  margin-bottom: 10px;
}
.fb-msgs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fb-msg {
  border-radius: 12px;
  padding: 10px 12px;
  background: #f4f7fb;
}
.fb-msg.school {
  background: #eef5ff;
}
.fb-msg.college {
  background: #f7f3ee;
}
.fb-msg header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--muted);
}
.fb-msg p {
  margin: 0;
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.5;
}
.fb-foot {
  border-top: 1px solid #eef2f7;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  display: grid;
  gap: 8px;
}
.fb-foot textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  font: inherit;
  resize: vertical;
  background: #f7f9fc;
}
</style>
