<template>
  <div class="agent-page">
    <div ref="listEl" class="agent-scroll">
      <div class="ui-hero is-official">
        <div class="eyebrow"><b></b> {{ heroEyebrow }}</div>
        <h2>会议智能体</h2>
        <p>{{ statusNote }}</p>
        <div class="nums">
          <div class="kpi sky"><strong>{{ dialogRounds }}</strong><span>轮对话</span></div>
        </div>
      </div>

      <div class="ui-filter-wrap">
        <div class="ui-filter is-scroll" role="list">
          <button
            v-for="q in quickAsks"
            :key="q"
            type="button"
            role="listitem"
            @click="ask(q)"
          >
            {{ q }}
          </button>
        </div>
      </div>

      <div class="ui-sec">
        <h3><i></i>对话记录</h3>
        <div class="ui-sec-actions">
          <span class="n">{{ messages.length }} 条</span>
          <button
            v-if="hasSavedHistory"
            class="clear-btn"
            type="button"
            :disabled="loading"
            @click="clearHistory"
          >
            清空记录
          </button>
        </div>
      </div>

      <article
        v-for="(m, idx) in messages"
        :key="idx"
        class="msg-row"
        :class="m.role === 'user' ? 'user' : 'assistant'"
      >
        <div class="bubble">
          <div class="who">{{ m.role === 'user' ? '我' : '智能体' }}</div>
          <div
            v-if="m.role === 'assistant'"
            class="msg-md"
            v-html="renderMarkdown(m.content)"
          />
          <pre v-else class="msg-text">{{ m.content }}</pre>
          <div v-if="m.citations?.length" class="cites">
            <div v-for="c in m.citations" :key="c.id">{{ c.title }} · {{ c.source }}</div>
          </div>
          <div v-if="m.actions?.length" class="actions">
            <div
              v-for="a in m.actions"
              :key="a.id"
              class="confirm-card"
              :class="{ danger: a.requiresConfirm }"
            >
              <div class="t">{{ a.title }}</div>
              <div class="d">{{ a.description }}</div>
              <div class="note">红线：审题 / 决议登记须人工确认</div>
              <div class="btns">
                <button
                  v-if="a.link && !a.requiresConfirm"
                  class="ui-btn"
                  type="button"
                  @click="go(a.link!)"
                >
                  {{ navButtonLabel(a.link) }}
                </button>
                <template v-else-if="a.requiresConfirm">
                  <button class="ui-btn light" type="button" @click="confirmAction(a, false)">
                    取消
                  </button>
                  <button class="ui-btn" type="button" @click="confirmAction(a, true)">
                    {{ a.executable ? '确认' : '去页面办理' }}
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <footer class="agent-composer">
      <textarea
        v-model="input"
        rows="1"
        placeholder="例如：帮我看看待整理的纪要"
        @keydown.enter.exact.prevent="send"
      />
      <button class="ui-btn" type="button" :disabled="loading" @click="send">
        {{ loading ? '…' : '发送' }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useRoles } from '@/composables/useRoles'
import { renderMarkdown, stripAgentMetaSuffix } from '@/utils/markdown'
import { streamAgentChat } from '@/utils/agentStream'

interface AgentAction {
  id: string
  type: string
  title: string
  description: string
  status: string
  link?: string
  requiresConfirm: boolean
  executable: boolean
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  citations?: Array<{ id: string; title: string; source: string }>
  actions?: AgentAction[]
}

const route = useRoute()
const router = useRouter()
const { isSchoolViewer, isSchoolAdmin } = useRoles()
const isViewerOnly = computed(
  () => isSchoolViewer.value && !isSchoolAdmin.value,
)
const welcomeText = computed(() =>
  isViewerOnly.value
    ? '您好。可按学院、议题或会议关键词提问，例如「哪些学院召开了有关人才引进的会议」。答复供查阅参考，不替代正式审签。'
    : '您好。可问今日简报、待办、议题检索与议事规则。审题、表决、签署只给引导，须您本人确认。',
)
const loading = ref(false)
const input = ref('')
const sessionId = ref('')
const listEl = ref<HTMLElement | null>(null)
const hasSavedHistory = ref(false)
const messages = ref<ChatMsg[]>([
  {
    role: 'assistant',
    content:
      '您好。可问今日简报、待办、议题检索与议事规则。审题、表决、签署只给引导，须您本人确认。',
  },
])

const quickAsks = computed(() =>
  isViewerOnly.value
    ? ['本月召开简报', '缺开与预警', '督办逾期情况', '缺席书面意见算不算票？']
    : ['今日简报', '我有哪些待办？', '督办预警', '缺席书面意见算不算票？'],
)

const heroEyebrow = computed(() =>
  isViewerOnly.value ? '校级查阅 · 智能问答' : '会务问答 · 智能辅助',
)

const statusNote = computed(() =>
  isViewerOnly.value
    ? '用自然语言查询所管学院的会议、议题与召开情况；结果可一键打开详情，仅供查阅参考。'
    : '用自然语言查待办、简报、议题与议事规则；需要办理时给出入口，审题与表决仍须本人确认。',
)

const dialogRounds = computed(() =>
  Math.max(0, messages.value.filter((m) => m.role === 'user').length),
)

function pageContext() {
  return { route: route.fullPath }
}

function navButtonLabel(link?: string) {
  if (!link) return '前往办理'
  if (link.startsWith('/meetings')) return '前往会议'
  if (link.startsWith('/topics')) return '前往议题'
  return '前往办理'
}

async function scrollBottom() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

async function loadHistory() {
  try {
    const res: any = await http.get('/agent/history', { params: { limit: 80 } })
    const saved = Array.isArray(res.messages) ? res.messages : []
    if (res.sessionId) sessionId.value = String(res.sessionId)
    hasSavedHistory.value = saved.length > 0
    if (!saved.length) {
      messages.value = [{ role: 'assistant', content: welcomeText.value }]
      return
    }
    messages.value = [
      { role: 'assistant', content: welcomeText.value },
      ...saved.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: stripAgentMetaSuffix(String(m.content || '')),
        citations: m.citations,
        actions: m.actions || [],
      })),
    ]
    await scrollBottom()
  } catch {
    /* 无历史不影响使用 */
  }
}

async function clearHistory() {
  if (loading.value) return
  loading.value = true
  try {
    await http.delete('/agent/history')
    sessionId.value = ''
    hasSavedHistory.value = false
    messages.value = [{ role: 'assistant', content: welcomeText.value }]
    ElMessage.success('对话记录已清空')
  } catch (e: any) {
    ElMessage.error(String(e))
  } finally {
    loading.value = false
  }
}

async function ask(text: string) {
  input.value = text
  await send()
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  await scrollBottom()

  const assistant: ChatMsg = { role: 'assistant', content: '正在思考…' }
  messages.value.push(assistant)
  const idx = messages.value.length - 1
  await scrollBottom()

  try {
    let started = false
    await streamAgentChat(
      {
        message: text,
        sessionId: sessionId.value || undefined,
        context: pageContext(),
      },
      {
        onStatus: () => {
          if (!started) {
            messages.value[idx] = { ...messages.value[idx], content: '' }
          }
        },
        onToken: (chunk) => {
          if (!started) {
            started = true
            messages.value[idx] = { ...messages.value[idx], content: '' }
          }
          const cur = messages.value[idx]
          messages.value[idx] = {
            ...cur,
            content: (cur.content || '') + chunk,
          }
          void scrollBottom()
        },
        onDone: (payload) => {
          sessionId.value = payload.sessionId || sessionId.value
          hasSavedHistory.value = true
          messages.value[idx] = {
            role: 'assistant',
            content: payload.reply || messages.value[idx].content || '（无回复）',
            citations: payload.citations,
            actions: payload.actions || [],
          }
        },
        onError: (message) => {
          messages.value[idx] = {
            role: 'assistant',
            content: `请求失败：${message}`,
          }
        },
      },
    )
  } catch (e: any) {
    messages.value[idx] = {
      role: 'assistant',
      content: `请求失败：${String(e)}`,
    }
  } finally {
    loading.value = false
    await scrollBottom()
  }
}

function go(link: string) {
  router.push(link)
}

async function confirmAction(action: AgentAction, approved: boolean) {
  try {
    const res: any = await http.post(`/agent/confirm/${action.id}`, { approved })
    if (!approved) {
      ElMessage.info('已取消')
      return
    }
    if (res.status === 'BLOCKED' || !action.executable) {
      ElMessage.warning(res.message || '请前往业务页面本人办理')
      if (res.link || action.link) go(res.link || action.link)
      return
    }
    ElMessage.success(res.message || '已确认')
    if (res.link || action.link) go(res.link || action.link)
  } catch (e: any) {
    ElMessage.error(String(e))
  }
}

onMounted(async () => {
  messages.value = [{ role: 'assistant', content: welcomeText.value }]
  await loadHistory()
})
</script>

<style scoped>
.agent-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.agent-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 8px;
}

.msg-row {
  display: flex;
  margin: 0 0 12px;
}
.msg-row.user {
  justify-content: flex-end;
}
.msg-row.assistant {
  justify-content: flex-start;
}
.msg-row .bubble {
  max-width: min(92%, 640px);
  padding: 10px 14px 12px;
  border-radius: 14px;
}
.msg-row.user .bubble {
  background: var(--joint, #1a4f8b);
  color: #fff;
  border-radius: 14px 14px 4px 14px;
  box-shadow: 0 6px 16px rgba(26, 79, 139, 0.18);
}
.msg-row.assistant .bubble {
  background: #fff;
  color: var(--text, #1e293b);
  border: 1px solid var(--line, #e6e8ee);
  border-left: 3px solid #0f766e;
  border-radius: 14px 14px 14px 4px;
  box-shadow: var(--shadow);
}
.msg-row .who {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.msg-row.user .who {
  color: rgba(255, 255, 255, 0.78);
  text-align: right;
}
.msg-row.assistant .who {
  color: #0f766e;
}

.clear-btn {
  margin-left: auto;
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
}
.clear-btn:hover:not(:disabled) {
  color: var(--party);
}
.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.msg-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  color: inherit;
}

.msg-md {
  font-size: 14px;
  line-height: 1.6;
  color: inherit;
  word-break: break-word;
}
.msg-md :deep(p) {
  margin: 0 0 0.65em;
}
.msg-md :deep(p:last-child) {
  margin-bottom: 0;
}
.msg-md :deep(h1),
.msg-md :deep(h2),
.msg-md :deep(h3) {
  margin: 0.4em 0 0.5em;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
}
.msg-md :deep(ul),
.msg-md :deep(ol) {
  margin: 0.35em 0 0.65em;
  padding-left: 1.35em;
}
.msg-md :deep(li) {
  margin: 0.2em 0;
}
.msg-md :deep(strong) {
  font-weight: 700;
}
.msg-md :deep(code) {
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #f1f5f9;
}
.msg-md :deep(pre) {
  margin: 0.5em 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  overflow-x: auto;
  font-size: 12px;
  white-space: pre-wrap;
}

.msg-row.user .msg-text {
  color: #fff;
}

.cites {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}
.msg-row.assistant .cites {
  border-top-color: #e2e8f0;
}

.confirm-card {
  margin-top: 10px;
  padding: 12px;
  border-radius: 12px;
  background: #f7f9fc;
  border: 1px solid var(--line);
}

.confirm-card.danger {
  border-color: #f0c9cc;
  background: #fdf6f6;
}

.confirm-card .t {
  font-weight: 700;
  font-size: 14px;
}

.confirm-card .d {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}

.confirm-card .note {
  margin-top: 8px;
  font-size: 11px;
  color: var(--party);
  font-weight: 600;
}

.confirm-card .btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  justify-content: flex-end;
}

.agent-composer {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 0 calc(10px + var(--safe-b));
  background: var(--bg);
  border-top: 1px solid var(--line);
}

.agent-composer textarea {
  flex: 1;
  min-height: 40px;
  max-height: 96px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  resize: none;
  outline: none;
  background: var(--card);
  color: var(--text);
}

.agent-composer textarea:focus {
  border-color: var(--joint);
}

.agent-composer .ui-btn {
  flex-shrink: 0;
  height: 40px;
  min-width: 64px;
}

.agent-composer .ui-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
