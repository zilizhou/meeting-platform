/** 会中四步：签到 → 讨论表决 → 形成决议 → 签纪要（由业务数据推导，不落库） */

export interface MeetingFlowInput {
  status?: string
  actualAttend?: number | null
  topics?: Array<{ resolution?: unknown | null }> | null
  minutes?: { effectiveAt?: string | null; id?: string } | null
}

export interface MeetingFlowStep {
  /** 0–3 当前步；全部完成时仍为 3 且 allDone=true */
  index: number
  allDone: boolean
  key: 'checkin' | 'discuss' | 'resolve' | 'minutes' | 'done'
  label: string
  nextLabel?: string
}

export const MEETING_FLOW_STEPS = [
  { key: 'checkin' as const, short: '签到', full: '签到' },
  { key: 'discuss' as const, short: '讨论', full: '讨论表决' },
  { key: 'resolve' as const, short: '决议', full: '形成决议' },
  { key: 'minutes' as const, short: '签纪要', full: '签纪要' },
]

export function deriveMeetingFlowStep(m: MeetingFlowInput | null | undefined): MeetingFlowStep {
  if (!m) {
    return { index: 0, allDone: false, key: 'checkin', label: '签到', nextLabel: '讨论表决' }
  }

  if (
    m.minutes?.effectiveAt ||
    m.status === 'ARCHIVED' ||
    m.status === 'RESOLVED'
  ) {
    return { index: 3, allDone: true, key: 'done', label: '已完成' }
  }

  const topics = m.topics || []
  const hasResolution = topics.some((t) => !!t.resolution)
  const allResolved = topics.length > 0 && topics.every((t) => !!t.resolution)
  const hasMinutes = !!m.minutes
  const attend = m.actualAttend ?? 0

  if (m.status === 'ENDED' || hasMinutes || allResolved) {
    return {
      index: 3,
      allDone: false,
      key: 'minutes',
      label: '签纪要',
    }
  }

  if (attend > 0) {
    if (hasResolution) {
      return {
        index: 2,
        allDone: false,
        key: 'resolve',
        label: '形成决议',
        nextLabel: '签纪要',
      }
    }
    return {
      index: 1,
      allDone: false,
      key: 'discuss',
      label: '讨论表决',
      nextLabel: '形成决议',
    }
  }

  return {
    index: 0,
    allDone: false,
    key: 'checkin',
    label: '签到',
    nextLabel: '讨论表决',
  }
}

export function meetingFlowState(
  index: number,
  flow: MeetingFlowStep,
): 'done' | 'current' | 'pending' {
  if (flow.allDone) return 'done'
  if (index < flow.index) return 'done'
  if (index === flow.index) return 'current'
  return 'pending'
}

export function meetingFlowPanelId(index: number): string {
  if (index <= 0) return 'meeting-flow-checkin'
  if (index === 1 || index === 2) return 'meeting-flow-agenda'
  return 'meeting-flow-minutes'
}

export function meetingFlowResumeText(m: MeetingFlowInput | null | undefined): string {
  const flow = deriveMeetingFlowStep(m)
  if (flow.allDone) return '流程已完成'
  if (m?.status === 'DRAFT' || m?.status === 'SCHEDULED') {
    return flow.index === 0 ? `待开始 · ${flow.label}` : `当前：${flow.label}`
  }
  return `当前：${flow.label}`
}
