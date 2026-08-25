/** 辅助系统：整理纪要后即可归档（由业务数据推导，不落库） */

export interface MeetingFlowInput {
  status?: string
  minutes?: {
    id?: string
    content?: string | null
    filePath?: string | null
    originalName?: string | null
  } | null
}

export interface MeetingFlowStep {
  index: number
  allDone: boolean
  key: 'minutes' | 'done'
  label: string
  nextLabel?: string
}

function hasMinutes(m: MeetingFlowInput | null | undefined) {
  const minutes = m?.minutes
  if (!minutes) return false
  return Boolean(
    minutes.id ||
      (minutes.content && minutes.content.trim()) ||
      minutes.filePath ||
      minutes.originalName,
  )
}

export function deriveMeetingFlowStep(m: MeetingFlowInput | null | undefined): MeetingFlowStep {
  if (!m) {
    return { index: 0, allDone: false, key: 'minutes', label: '整理纪要' }
  }

  if (m.status === 'ARCHIVED' || hasMinutes(m)) {
    return { index: 0, allDone: true, key: 'done', label: '已完成' }
  }

  return {
    index: 0,
    allDone: false,
    key: 'minutes',
    label: '整理纪要',
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
