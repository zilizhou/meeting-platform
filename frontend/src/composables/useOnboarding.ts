import { computed, reactive, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

export type GuideMode = 'novice' | 'expert'
export type GuideKey =
  | 'overview'
  | 'viewer-overview'
  | 'apply-topic'
  | 'review-topic'
  | 'organize-meeting'
  | 'minutes'
  | 'supervision'
  | 'archives'

export interface GuideStep {
  title: string
  description: string
  path?: string
  action?: string
}

export interface GuideDefinition {
  title: string
  summary: string
  steps: GuideStep[]
}

export const onboardingGuides: Record<GuideKey, GuideDefinition> = {
  'viewer-overview': {
    title: '认识校级查阅端',
    summary: '了解监管和查阅入口。',
    steps: [
      { title: '先看总览', description: '从召开态势、预警和领导简报快速掌握全校双会情况。', path: '/admin', action: '打开总览' },
      { title: '跟踪决议落实', description: '在督办中按学院、状态和时限查看决议执行情况。', path: '/supervisions', action: '打开督办' },
      { title: '查阅归档材料', description: '在权限范围内检索已归档会议及其材料。', path: '/archives', action: '打开档案' },
      { title: '随时重新引导', description: '在“我的”页面可以重新开始，熟悉后也可切换为熟练模式。', path: '/me', action: '打开我的' },
    ],
  },
  overview: {
    title: '认识系统',
    summary: '用 1 分钟了解最常用的入口。',
    steps: [
      { title: '先看待办', description: '需要你处理的审核、签到、签署和督办会集中在这里。', path: '/todo', action: '打开待办' },
      { title: '再看会议', description: '查看即将召开、进行中和已经归档的会议。', path: '/meet', action: '打开会议' },
      { title: '从工作台发起业务', description: '申报议题、管理议题库、组织会议和查询档案都从这里开始。', path: '/work', action: '打开工作台' },
      { title: '需要帮助时', description: '在“我的”页面可以切换熟练模式，或随时重新开始引导。', path: '/me', action: '查看使用帮助' },
    ],
  },
  'apply-topic': {
    title: '申报议题',
    summary: '从填写事项到提交审核。',
    steps: [
      { title: '创建议题', description: '选择会议类型，填写议题名称、背景、决策事项和汇报人。', path: '/topic-create', action: '去创建议题' },
      { title: '补齐材料', description: '按页面要求上传上会材料，确认涉密等级和经费等关键字段。' },
      { title: '提交审核', description: '保存草稿不等于提交；检查完整后点击提交，随后可在议题库跟踪状态。', path: '/topics', action: '打开议题库' },
    ],
  },
  'review-topic': {
    title: '审核议题', summary: '找到待审事项并给出明确意见。', steps: [
      { title: '进入待办', description: '系统会根据你的角色列出当前应处理的议题。', path: '/todo', action: '查看我的待办' },
      { title: '核对内容与附件', description: '重点检查决策事项、前置程序、材料完整性和会议类型。' },
      { title: '提交审核意见', description: '选择通过或退回；退回时写清可执行的修改要求。' },
    ],
  },
  'organize-meeting': {
    title: '组织会议', summary: '完成排期、议程和参会准备。', steps: [
      { title: '进入会议管理', description: '选择党组织会议或党政联席会议轨道。', path: '/meet', action: '打开会议管理' },
      { title: '创建并排期', description: '填写时间地点、主持人和参会范围，把已审核议题加入议程。' },
      { title: '会前核查', description: '确认材料、参会名单和法定人数，避免临会补录。' },
    ],
  },
  minutes: {
    title: '纪要与签署', summary: '从会议记录到双签归档。', steps: [
      { title: '找到对应会议', description: '在会议列表打开已结束、待形成纪要的会议。', path: '/meet', action: '打开会议' },
      { title: '整理会议结果', description: '核对讨论结论、表决结果和回避情况，再生成或编辑纪要。' },
      { title: '完成签署归档', description: '按会议类型完成规定签署；归档后在档案中心检索。', path: '/archives', action: '打开档案中心' },
    ],
  },
  supervision: {
    title: '办理督办', summary: '跟踪决议落实情况。', steps: [
      { title: '进入决议督办', description: '按状态、责任部门或时限查找需要办理的事项。', path: '/supervisions', action: '打开决议督办' },
      { title: '填写进展', description: '提交真实进度和佐证材料；有风险时及时说明原因。' },
      { title: '申请办结', description: '完成后提交办结结果，由有权限的人员确认。' },
    ],
  },
  archives: {
    title: '查询档案', summary: '快速找到已归档会议材料。', steps: [
      { title: '进入档案中心', description: '可按会议类型、时间和关键词检索。', path: '/archives', action: '打开档案中心' },
      { title: '查看归档材料', description: '从会议记录进入议程、议题材料、纪要等归档内容。' },
    ],
  },
}

interface StoredState {
  mode: GuideMode
  welcomeCompleted: boolean
  completedGuides: GuideKey[]
}

const state = reactive({
  account: '',
  mode: 'novice' as GuideMode,
  welcomeCompleted: false,
  completedGuides: [] as GuideKey[],
  activeGuideKey: null as GuideKey | null,
  step: 0,
})

function storageKey(account: string) {
  return `mingde:onboarding:${account}`
}

function load(account: string) {
  if (!account || state.account === account) return
  state.account = account
  state.activeGuideKey = null
  state.step = 0
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(account)) || '{}') as Partial<StoredState>
    state.mode = saved.mode === 'expert' ? 'expert' : 'novice'
    state.welcomeCompleted = Boolean(saved.welcomeCompleted)
    state.completedGuides = Array.isArray(saved.completedGuides) ? saved.completedGuides : []
  } catch {
    state.mode = 'novice'
    state.welcomeCompleted = false
    state.completedGuides = []
  }
}

function save() {
  if (!state.account) return
  const value: StoredState = {
    mode: state.mode,
    welcomeCompleted: state.welcomeCompleted,
    completedGuides: state.completedGuides,
  }
  localStorage.setItem(storageKey(state.account), JSON.stringify(value))
}

export function useOnboarding() {
  const auth = useAuthStore()
  watch(() => auth.user?.username, (username) => load(username || ''), { immediate: true })

  const roles = computed(() => auth.user?.roles || [])
  const isViewer = computed(() => roles.value.includes('SCHOOL_VIEWER') && !roles.value.includes('SCHOOL_ADMIN'))
  const roleTitle = computed(() => {
    if (isViewer.value) return '校级查阅人员'
    if (auth.user?.isSchoolAdmin || roles.value.includes('SCHOOL_ADMIN')) return '校级管理员'
    if (roles.value.includes('MEETING_SECRETARY') || roles.value.includes('COLLEGE_ADMIN')) return '会务管理人员'
    if (roles.value.includes('SECRETARY')) return '党委负责人'
    if (roles.value.includes('DEAN')) return '行政负责人'
    return '参会及办理人员'
  })
  const roleMission = computed(() => {
    if (isViewer.value) return '查看双会态势、预警、督办、档案和领导简报。'
    if (roles.value.includes('SCHOOL_ADMIN')) return '开展校级监管、巡视导出和系统管理。'
    if (roles.value.includes('MEETING_SECRETARY') || roles.value.includes('COLLEGE_ADMIN')) return '征集议题、组织会议、记录表决、形成纪要并归档。'
    if (roles.value.includes('SECRETARY')) return '审核议题、主持会议，并完成规定的纪要签署。'
    if (roles.value.includes('DEAN')) return '审核联席议题、参加会议，并完成规定的纪要签署。'
    return '处理阅件、签到、讨论、表决及分配给你的事项。'
  })
  const showWelcome = computed(() => Boolean(auth.user) && state.mode === 'novice' && !state.welcomeCompleted)
  const activeGuide = computed(() => state.activeGuideKey ? onboardingGuides[state.activeGuideKey] : null)

  function dismissWelcome() { state.welcomeCompleted = true; save() }
  function restartWelcome() { state.mode = 'novice'; state.welcomeCompleted = false; state.activeGuideKey = null; save() }
  function setMode(mode: GuideMode) { state.mode = mode; if (mode === 'expert') state.activeGuideKey = null; save() }
  function startGuide(key: GuideKey) { state.welcomeCompleted = true; state.activeGuideKey = key; state.step = 0; save() }
  function closeGuide(completed = false) {
    if (completed && state.activeGuideKey && !state.completedGuides.includes(state.activeGuideKey)) state.completedGuides.push(state.activeGuideKey)
    state.activeGuideKey = null
    state.step = 0
    save()
  }
  function nextStep() {
    if (!activeGuide.value) return
    if (state.step >= activeGuide.value.steps.length - 1) closeGuide(true)
    else state.step += 1
  }

  return { state, isViewer, roleTitle, roleMission, showWelcome, activeGuide, dismissWelcome, restartWelcome, setMode, startGuide, closeGuide, nextStep }
}
