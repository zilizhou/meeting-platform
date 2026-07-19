import { useAuthStore } from '@/stores/auth'

/** 带鉴权下载文件（blob） */
export async function downloadWithAuth(url: string, fallbackName: string) {
  const auth = useAuthStore()
  const res = await fetch(`/api${url}`, {
    headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
  })
  if (!res.ok) {
    let message = `下载失败（${res.status}）`
    try {
      const data = await res.json()
      message = data.message || message
    } catch {
      // ignore
    }
    throw new Error(Array.isArray(message) ? message.join('；') : message)
  }

  const disposition = res.headers.get('Content-Disposition') || ''
  let filename = fallbackName
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition)
  if (match) {
    filename = decodeURIComponent(match[1] || match[2])
  }

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}
