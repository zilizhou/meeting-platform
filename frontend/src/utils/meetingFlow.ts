/** 辅助系统两步：整理纪要 → 签署生效（由业务数据推导，不落库） */

export interface MeetingFlowInput {
  status?: string
  minutes?: {
    effectiveAt?: string | null
    id?: string
    content?: string | null
    filePath?: string | null
    originalName?: string | null
  } | null
}

export interface MeetingFlowStep {
  index: number
  allDone: boolean
  key: 'minutes' | 'sign' | 'done'
  label: string
  nextLabel?: string
}

export function deriveMeetingFlowStep(m: MeetingFlowInput | null | undefined): MeetingFlowStep {
  if (!m) {
    return { index: 0, allDone: false, key: 'minutes', label: '整理纪要', nextLabel: '签署生效' }
  }

  if (
    m.minutes?.effectiveAt ||
    m.status === 'ARCHIVED' ||
    m.status === 'RESOLVED'
  ) {
    return { index: 1, allDone: true, key: 'done', label: '已完成' }
  }

  const hasMinutes = !!(
    m.minutes?.id ||
    (m.minutes?.content && m.minutes.content.trim()) ||
    m.minutes?.filePath
  )

  if (hasMinutes) {
    return { index: 1, allDone: false, key: 'sign', label: '签署生效' }
  }

  return {
    index: 0,
    allDone: false,
    key: 'minutes',
    label: '整理纪要',
    nextLabel: '签署生效',
  }
}

export function meetingFlowResumeText(m: MeetingFlowInput | null | undefined): string {
  const flow = deriveMeetingFlowStep(m)
  if (flow.allDone) return '流程已完成'
  if (m?.status === 'DRAFT' || m?.status === 'SCHEDULED') {
    return `待办理 · ${flow.label}`
  }
  return `当前：${flow.label}`
}
