import { useAuthStore } from '@/stores/auth'

export interface AgentStreamDone {
  sessionId?: string
  intent?: string
  reply?: string
  demo?: boolean
  provider?: string
  model?: string
  citations?: Array<{ id: string; title: string; source: string }>
  actions?: any[]
  disclaimer?: string
}

export interface AgentStreamHandlers {
  onStatus?: (phase: string) => void
  onMeta?: (meta: Record<string, unknown>) => void
  onToken?: (text: string) => void
  onDone?: (payload: AgentStreamDone) => void
  onError?: (message: string) => void
}

/** 调用智能体 SSE：/api/agent/chat/stream */
export async function streamAgentChat(
  body: {
    message: string
    sessionId?: string
    context?: Record<string, unknown>
  },
  handlers: AgentStreamHandlers,
  signal?: AbortSignal,
) {
  const auth = useAuthStore()
  const res = await fetch('/api/agent/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(errText || `流式请求失败 HTTP ${res.status}`)
  }
  if (!res.body) throw new Error('浏览器不支持流式响应')

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let currentEvent = 'message'

  const flushBlock = (block: string) => {
    const lines = block.split('\n')
    let event = currentEvent
    const dataLines: string[] = []
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
    if (!dataLines.length) return
    const raw = dataLines.join('\n')
    let data: any = raw
    try {
      data = JSON.parse(raw)
    } catch {
      /* keep string */
    }
    if (event === 'status') handlers.onStatus?.(String(data?.phase || ''))
    else if (event === 'meta') handlers.onMeta?.(data || {})
    else if (event === 'token') handlers.onToken?.(String(data?.text || ''))
    else if (event === 'done') handlers.onDone?.(data || {})
    else if (event === 'error') {
      handlers.onError?.(String(data?.message || raw || '流式对话失败'))
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n')
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      if (block.trim()) flushBlock(block)
    }
  }
  if (buffer.trim()) flushBlock(buffer)
}
