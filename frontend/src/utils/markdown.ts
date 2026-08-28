import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

/** 极简消毒：去掉脚本与事件属性，保留常规 Markdown / 富文本 HTML */
export function sanitizeHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

/** 富文本空内容（wangEditor 空值为 `<p><br></p>` 等） */
export function isRichTextEmpty(html: string) {
  const text = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return !text
}

/** 是否像 HTML 片段（富文本存库后回显） */
export function looksLikeHtml(source: string) {
  return /<\/?[a-z][\s\S]*>/i.test(String(source || '').trim())
}

/** 议题正文：富文本 HTML 直接消毒；历史纯文本 / Markdown 走 marked */
export function renderContentHtml(source: string) {
  const raw = String(source || '').trim()
  if (!raw) return ''
  if (looksLikeHtml(raw)) return sanitizeHtml(raw)
  return renderMarkdown(raw)
}

/** 将 AI / 纯文本草稿转为可写入富文本编辑器的 HTML */
export function toEditorHtml(source: string) {
  const raw = String(source || '').trim()
  if (!raw) return ''
  if (looksLikeHtml(raw) && /<(p|h[1-6]|ul|ol|li|div|br)\b/i.test(raw)) {
    return sanitizeHtml(raw)
  }
  return renderMarkdown(formatTopicDraftMarkdown(raw))
}

const SECTION_TITLE =
  '背景与现状|政策依据|拟提请事项|预期影响与落实安排|事项说明|请示事项|议案要点'

/**
 * 把 AI 常返回的「整段挤在一起」的议题稿，整理成可渲染的 Markdown：
 * - 在「一、二、三、四、」前强制分段
 * - 节标题加粗并单独成行
 */
export function formatTopicDraftMarkdown(source: string) {
  let text = stripAgentMetaSuffix(String(source || ''))
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n') // JSON 里偶发字面量 \n
    .replace(/\*\*/g, '') // 先去掉已有加粗，统一重排，避免 ** 被拆断
    .trim()
  if (!text) return ''

  // 1) 在「一、二、…」序号前强制分段（文首除外）
  text = text.replace(/\s*([一二三四五六七八九十]+、)/g, (_m, marker: string, offset: number) =>
    (offset === 0 ? '' : '\n\n') + marker,
  )

  // 2) 行首已知节标题 → 加粗并与正文空一行
  const titleLine = new RegExp(
    `^([一二三四五六七八九十]+、\\s*(?:${SECTION_TITLE}))\\s*`,
    'gm',
  )
  text = text.replace(titleLine, '**$1**\n\n')

  // 3) 清理空白
  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // 极短且仍无换行时，按句号断一下，避免整坨
  if (!text.includes('\n')) {
    text = text.replace(/([。！？；])\s*/g, '$1\n').trim()
  }

  return text
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
