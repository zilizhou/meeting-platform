<template>
  <div class="agent-page">
    <div ref="listEl" class="agent-scroll">
      <div class="ui-hero is-official">
        <div class="eyebrow"><b></b> 辅助找事 · 不替代审签</div>
        <h2>会议智能体</h2>
        <p>{{ statusNote }}</p>
        <div class="nums">
          <div><strong>{{ dialogRounds }}</strong><span>轮对话</span></div>
          <div><strong>{{ configured ? '在线' : '演示' }}</strong><span>运行模式</span></div>
          <div><strong>{{ pendingActions }}</strong><span>待确认</span></div>
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
        <span class="n">{{ messages.length }} 条</span>
      </div>

      <article
        v-for="(m, idx) in messages"
        :key="idx"
        class="msg-card ui-card"
        :class="m.role === 'user' ? 'joint user' : 'ai'"
      >
        <div class="top">
          <span class="ui-tag" :class="m.role === 'user' ? 'joint' : undefined">
            {{ m.role === 'user' ? '我' : '智能体' }}
          </span>
        </div>
        <pre class="msg-text">{{ m.content }}</pre>
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
                前往办理
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
const loading = ref(false)
const input = ref('')
const sessionId = ref('')
const configured = ref(false)
const listEl = ref<HTMLElement | null>(null)
const messages = ref<ChatMsg[]>([
  {
    role: 'assistant',
    content:
      '您好。可问今日简报、待办、议题、督办与议事规则。审题/决议/签署只给建议，须您本人确认，不自动改状态。',
  },
])

const quickAsks = computed(() =>
  isViewerOnly.value
    ? ['本月召开简报', '缺开与预警', '督办逾期情况', '缺席书面意见算不算票？']
    : ['今日简报', '我有哪些待办？', '督办预警', '缺席书面意见算不算票？'],
)

const statusNote = computed(() => {
  if (isViewerOnly.value) {
    return configured.value
      ? '可问召开态势、缺开预警、督办与议事规则。只读辅助，不替代审签。'
      : '演示/知识库模式 · 校级查阅只读辅助'
  }
  return configured.value
    ? '可问今日简报、待办、议题与规则。审题/决议须您确认。'
    : '演示/知识库模式 · 辅助不替代审签'
})

const dialogRounds = computed(() =>
  Math.max(0, messages.value.filter((m) => m.role === 'user').length),
)

const pendingActions = computed(() =>
  messages.value.reduce((n, m) => n + (m.actions?.length || 0), 0),
)

function pageContext() {
  return { route: route.fullPath }
}

async function scrollBottom() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

async function loadStatus() {
  try {
    const res: any = await http.get('/agent/status')
    configured.value = Boolean(res.configured)
  } catch {
    configured.value = false
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
  try {
    const res: any = await http.post('/agent/chat', {
      message: text,
      sessionId: sessionId.value || undefined,
      context: pageContext(),
    })
    sessionId.value = res.sessionId || sessionId.value
    messages.value.push({
      role: 'assistant',
      content: res.reply || '（无回复）',
      citations: res.citations,
      actions: res.actions || [],
    })
  } catch (e: any) {
    messages.value.push({ role: 'assistant', content: `请求失败：${String(e)}` })
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

onMounted(loadStatus)
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

.msg-card.user {
  margin-left: 12%;
}

.msg-card.ai::before {
  background: var(--joint);
}

.msg-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text);
}

.cites {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
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
