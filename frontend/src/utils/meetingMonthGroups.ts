/** 两会列表按「年-月」分组，便于对照月度召开要求 */

export interface MonthGroupMeeting {
  id: string
  scheduledAt?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

export interface MonthGroup<T extends MonthGroupMeeting = MonthGroupMeeting> {
  key: string
  label: string
  count: number
  meetings: Array<T & { monthIndex: number }>
}

function parseMeetingDate(m: MonthGroupMeeting): Date | null {
  const raw = m.scheduledAt || m.createdAt
  if (!raw) return null
  const d = new Date(raw as string)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatMonthLabel(year: number, month: number) {
  return `${year}年${month}月`
}

/** 将会议按月份分组；月份新→旧，组内先按时间正序编号，再按时间倒序展示 */
export function groupMeetingsByMonth<T extends MonthGroupMeeting>(
  list: T[],
): MonthGroup<T>[] {
  const buckets = new Map<string, T[]>()

  for (const m of list) {
    const d = parseMeetingDate(m)
    const key = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : 'pending'
    const arr = buckets.get(key)
    if (arr) arr.push(m)
    else buckets.set(key, [m])
  }

  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === 'pending') return 1
    if (b === 'pending') return -1
    return b.localeCompare(a)
  })

  return keys.map((key) => {
    const items = buckets.get(key) || []
    const ordered = [...items].sort((a, b) => {
      const da = parseMeetingDate(a)?.getTime() ?? 0
      const db = parseMeetingDate(b)?.getTime() ?? 0
      return da - db
    })
    const withIndex = ordered.map((m, i) => ({ ...m, monthIndex: i + 1 }))
    const display = [...withIndex].sort((a, b) => {
      const da = parseMeetingDate(a)?.getTime() ?? 0
      const db = parseMeetingDate(b)?.getTime() ?? 0
      return db - da
    })

    let label = '时间待定'
    if (key !== 'pending') {
      const [y, mo] = key.split('-').map(Number)
      label = formatMonthLabel(y, mo)
    }

    return {
      key,
      label,
      count: display.length,
      meetings: display,
    }
  })
}
