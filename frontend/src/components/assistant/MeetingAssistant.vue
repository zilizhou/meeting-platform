<template>
  <div class="assistant">
    <button
      v-if="!open"
      type="button"
      class="fab"
      aria-label="打开会议智能助理"
      @click="open = true"
    >
      智能助理
    </button>

    <div v-else class="panel">
      <header class="panel-head">
        <div>
          <div class="panel-title">会议智能助理</div>
          <div class="panel-sub">
            {{ statusNote }}
          </div>
        </div>
        <el-button text @click="open = false">收起</el-button>
      </header>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="tip"
        title="可问今日简报、议题/会议概况、风险阻断、督办预警、规则问答；审题/表决须本人确认。"
      />

      <div class="quick">
        <el-button
          v-for="q in quickAsks"
          :key="q"
          size="small"
          @click="ask(q)"
        >
          {{ q }}
        </el-button>
      </div>

      <div ref="listEl" class="messages">
        <div
          v-for="(m, idx) in messages"
          :key="idx"
          class="msg"
          :class="m.role"
        >
          <div class="bubble">
            <div class="who">{{ m.role === 'user' ? '我' : '智能体' }}</div>
            <div
              v-if="m.role === 'assistant'"
              class="msg-md"
              v-html="renderMarkdown(m.content)"
            />
            <pre v-else>{{ m.content }}</pre>
            <div v-if="m.citations?.length" class="cites">
              <div v-for="c in m.citations" :key="c.id" class="cite">
                {{ c.title }} · {{ c.source }}
              </div>
            </div>
            <div v-if="m.actions?.length" class="actions">
              <div
                v-for="a in m.actions"
                :key="a.id"
                class="action-card"
                :class="{ danger: a.requiresConfirm }"
              >
                <div class="action-title">{{ a.title }}</div>
                <div class="action-desc">{{ a.description }}</div>
                <div class="action-btns">
                  <el-button
                    v-if="a.link && !a.requiresConfirm"
                    size="small"
                    type="primary"
                    @click="go(a.link)"
                  >
                    {{ navButtonLabel(a.link) }}
                  </el-button>
                  <template v-else-if="a.requiresConfirm">
                    <el-button size="small" @click="confirmAction(a, false)">
                      取消
                    </el-button>
                    <el-button
                      size="small"
                      type="warning"
                      @click="confirmAction(a, true)"
                    >
                      {{ a.executable ? '确认' : '知道了，去页面办理' }}
                    </el-button>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer class="composer">
        <el-input
          v-model="input"
          type="textarea"
          :rows="2"
          resize="none"
          placeholder="例如：我有哪些待办？缺席意见算不算票？"
          @keydown.enter.exact.prevent="send"
        />
        <el-button type="primary" :loading="loading" @click="send">
          发送
        </el-button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
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
const WELCOME =
  '您好，我是会议智能助理。可提供今日简报、议题/会议概况、风险解释、督办预警、规则问答与审题意见草稿。涉及审题、表决、签署时，须您本人确认。'
const open = ref(false)
const loading = ref(false)
const input = ref('')
const sessionId = ref('')
const messages = ref<ChatMsg[]>([{ role: 'assistant', content: WELCOME }])
const listEl = ref<HTMLElement | null>(null)
const configured = ref(false)

const quickAsks = [
  '今日简报',
  '我有哪些待办？',
  '这个议题怎么样？',
  '为什么不能形成决议？',
  '督办预警',
  '缺席书面意见算不算票？',
]

const statusNote = computed(() =>
  configured.value ? '大模型已配置 · 辅助不替代审签' : '演示/知识库模式 · 辅助不替代审签',
)

function pageContext() {
  const name = String(route.name || '')
  const ctx: { route?: string; topicId?: string; meetingId?: string } = {
    route: route.fullPath,
  }
  if (name === 'topic-detail') ctx.topicId = String(route.params.id || '')
  if (name === 'meeting-detail') ctx.meetingId = String(route.params.id || '')
  return ctx
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

async function loadStatus() {
  try {
    const res: any = await http.get('/agent/status')
    configured.value = Boolean(res.configured)
  } catch {
    configured.value = false
  }
}

async function loadHistory() {
  try {
    const res: any = await http.get('/agent/history', { params: { limit: 80 } })
    const saved = Array.isArray(res.messages) ? res.messages : []
    if (res.sessionId) sessionId.value = String(res.sessionId)
    if (!saved.length) {
      messages.value = [{ role: 'assistant', content: WELCOME }]
      return
    }
    messages.value = [
      { role: 'assistant', content: WELCOME },
      ...saved.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: stripAgentMetaSuffix(String(m.content || '')),
        citations: m.citations,
        actions: m.actions || [],
      })),
    ]
  } catch {
    /* ignore */
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
  open.value = false
  router.push(link)
}

async function confirmAction(action: AgentAction, approved: boolean) {
  try {
    const res: any = await http.post(`/agent/confirm/${action.id}`, {
      approved,
    })
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
  await loadStatus()
  await loadHistory()
})
</script>

<style scoped>
.fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 40;
  border: none;
  border-radius: 999px;
  padding: 12px 18px;
  background: #1a4f8b;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.fab:hover {
  background: #0f355f;
}
.panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 40;
  width: min(420px, calc(100vw - 32px));
  height: min(640px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--line, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line, #e5e7eb);
  background: #f8fafc;
}
.panel-title {
  font-weight: 700;
  font-size: 15px;
}
.panel-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted, #6b7280);
}
.tip {
  margin: 10px 12px 0;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px 0;
}
.messages {
  flex: 1;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg {
  display: flex;
}
.msg.user {
  justify-content: flex-end;
}
.msg.assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: 92%;
  padding: 10px 12px;
  border-radius: 14px;
}
.msg.user .bubble {
  background: var(--joint, #1a4f8b);
  color: #fff;
  border-radius: 14px 14px 4px 14px;
}
.msg.assistant .bubble {
  background: #fff;
  color: #1e293b;
  border: 1px solid var(--line, #e5e7eb);
  border-left: 3px solid #0f766e;
  border-radius: 14px 14px 14px 4px;
}
.who {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-bottom: 5px;
}
.msg.user .who {
  color: rgba(255, 255, 255, 0.78);
  text-align: right;
}
.msg.assistant .who {
  color: #0f766e;
}
.bubble pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.55;
  color: inherit;
}
.msg-md {
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  color: inherit;
}
.msg-md :deep(p) {
  margin: 0 0 0.55em;
}
.msg-md :deep(p:last-child) {
  margin-bottom: 0;
}
.msg-md :deep(h1),
.msg-md :deep(h2),
.msg-md :deep(h3) {
  margin: 0.25em 0 0.45em;
  font-size: 14px;
  font-weight: 700;
}
.msg-md :deep(ul),
.msg-md :deep(ol) {
  margin: 0.25em 0 0.55em;
  padding-left: 1.3em;
}
.msg-md :deep(li) {
  margin: 0.15em 0;
}
.msg-md :deep(strong) {
  font-weight: 700;
}
.cites {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted, #6b7280);
}
.cite + .cite {
  margin-top: 2px;
}
.actions {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.action-card {
  border: 1px solid var(--line, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
}
.action-card.danger {
  border-color: #f5c2c7;
  background: #fff8f8;
}
.action-title {
  font-size: 13px;
  font-weight: 600;
}
.action-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted, #6b7280);
}
.action-btns {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 10px 12px 12px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--line, #e5e7eb);
  align-items: end;
}

@media (max-width: 900px) {
  .fab {
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    padding: 12px 16px;
    box-shadow: 0 8px 24px rgba(15, 53, 95, 0.28);
  }
  .panel {
    right: 0;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: 100dvh;
    height: 100vh;
    border-radius: 0;
    border: none;
    z-index: 60;
  }
  .panel-head {
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
  }
  .composer {
    grid-template-columns: 1fr;
  }
  .composer .el-button {
    width: 100%;
  }
}
</style>
