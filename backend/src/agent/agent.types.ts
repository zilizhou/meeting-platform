/** 智能体建议动作：一期仅导航/草稿；高风险须确认且暂不自动执行 */
export type AgentActionType =
  | 'NAVIGATE'
  | 'DRAFT_ONLY'
  | 'CONFIRM_REVIEW'
  | 'CONFIRM_VOTE'
  | 'CONFIRM_CHECKIN'
  | 'CONFIRM_URGE'
  | 'OPEN_BRIEF';

export type AgentActionStatus =
  | 'SUGGESTED'
  | 'PENDING_CONFIRM'
  | 'EXECUTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'BLOCKED';

export interface AgentAction {
  id: string;
  type: AgentActionType;
  title: string;
  description: string;
  status: AgentActionStatus;
  /** 前端跳转路径 */
  link?: string;
  /** 结构化载荷（确认后执行用） */
  payload?: Record<string, unknown>;
  /** 高风险操作必须用户确认 */
  requiresConfirm: boolean;
  /** 一期是否允许真正执行 */
  executable: boolean;
  expiresAt?: string;
}

export interface AgentChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface AgentChatResult {
  sessionId: string;
  intent: string;
  reply: string;
  demo: boolean;
  provider: string;
  model: string;
  citations?: Array<{
    id: string;
    title: string;
    source: string;
    excerpt?: string;
  }>;
  actions: AgentAction[];
  todosPreview?: Array<{
    type: string;
    title: string;
    link?: string;
  }>;
  disclaimer: string;
}
