import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

/** 极简消毒：去掉脚本与事件属性，保留常规 Markdown HTML */
function sanitizeHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

/** 去掉历史消息里附带的模型/演示后缀 */
export function stripAgentMetaSuffix(text: string) {
  return String(text || '')
    .replace(/\n*\n（(?:当前为演示[^）]*|openai_compatible[^）]*|demo[^）]*|[^）]*qwen[^）]*)）\s*$/i, '')
    .trimEnd()
}

export function renderMarkdown(source: string) {
  const raw = stripAgentMetaSuffix(source || '')
  const html = marked.parse(raw, { async: false }) as string
  return sanitizeHtml(html)
}
