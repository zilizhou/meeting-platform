import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AiService } from '../ai/ai.service';
import { LlmProvider } from '../ai/llm.provider';
import { WorkspaceService } from '../workspace/workspace.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/types';
import {
  MeetingStatus,
  MeetingType,
  RoleCode,
  SupervisionStatus,
} from '../common/constants';
import { prismaCollegeIdFilter, getVisibleCollegeIds } from '../common/roles';
import { AgentChatDto, AgentConfirmDto } from './dto/agent.dto';
import { AgentAction, AgentChatResult } from './agent.types';

const PROMPT_VERSION_AGENT = 'agent-chat-v3';
const KIND_AGENT = 'AGENT_CHAT';
const DISCLAIMER =
  '智能助理仅辅助汇报与查询；审题、表决、签署等须您本人确认。AI 不替代制度审签。';

const TODO_TYPE_LABEL: Record<string, string> = {
  JOINT_REVIEW: '联席审题',
  PARTY_REVIEW: '党委会审题',
  MINUTES: '整理纪要',
  MINUTES_SIGN: '整理纪要',
  SUPERVISION: '督办反馈',
  CHECKIN: '会议签到',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审题',
  DEFERRED: '已暂缓',
  APPROVED: '已通过审题',
  ON_AGENDA: '已入议程',
  DISCUSSED: '已讨论',
  RESOLVED: '已决议',
  REJECTED: '未通过',
  SCHEDULED: '已排期',
  IN_PROGRESS: '进行中',
  ENDED: '已结束',
  ARCHIVED: '已归档',
};

interface PendingAction {
  action: AgentAction;
  userId: string;
  createdAt: number;
}

@Injectable()
export class AgentService {
  private readonly pending = new Map<string, PendingAction>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AiService,
    private readonly llm: LlmProvider,
    private readonly workspace: WorkspaceService,
    private readonly notifications: NotificationsService,
  ) {}

  status(user: AuthUser) {
    const llm = this.llm.status();
    return {
      ...llm,
      role: 'meeting_assistant',
      capabilities: [
        'REPORT_TODOS',
        'REPORT_PROGRESS',
        'DAILY_BRIEF',
        'TOPIC_BRIEF',
        'MEETING_BRIEF',
        'STATS_ASK',
        'OPEN_QA',
        'RISK_EXPLAIN',
        'DRAFT_REVIEW_COMMENT',
        'MESSAGE_DIGEST',
        'SUPERVISION_ALERT',
        'SEARCH_TOPIC',
        'RULES_ASK',
        'NAVIGATE_SUGGEST',
        'CONFIRM_FRAMEWORK',
      ],
      levels: {
        L1: '只读汇报与问答（已开放）',
        L2: '草稿准备（审题意见草稿等已开放）',
        L3: '确认式代办（框架已预留，高风险暂不自动执行）',
        L4: '禁止自主审批/表决/签署',
      },
      disclaimer: DISCLAIMER,
      user: {
        realName: user.realName,
        roles: user.roles,
        collegeId: user.collegeId,
      },
      promptVersion: PROMPT_VERSION_AGENT,
    };
  }

  async chat(
    user: AuthUser,
    dto: AgentChatDto,
    stream?: {
      onToken?: (text: string) => void;
      onMeta?: (meta: Record<string, unknown>) => void;
      /** 标记是否已通过 onToken 推送过正文，避免 SSE 再假流式一遍 */
      markStreamed?: () => void;
    },
  ): Promise<AgentChatResult> {
    const message = dto.message.trim();
    if (!message) throw new BadRequestException('请输入内容');

    const sessionId = dto.sessionId || randomUUID();
    const intent = this.detectIntent(message, dto.context);
    const todos = await this.workspace.getTodos(user);
    const flow = await this.workspace.getFlowBoard(user);

    let reply = '';
    let citations: AgentChatResult['citations'];
    let demo = !this.llm.isConfigured();
    let provider = this.llm.isConfigured() ? 'openai_compatible' : 'demo';
    let model = this.llm.isConfigured()
      ? this.llm.status().model
      : 'rules-heuristic';
    const actions: AgentAction[] = [];
    let streamed = false;
    const onToken = stream?.onToken
      ? (text: string) => {
          if (!text) return;
          streamed = true;
          stream.onToken?.(text);
          stream.markStreamed?.();
        }
      : undefined;

    stream?.onMeta?.({
      sessionId,
      intent,
      demo,
      provider,
      model,
    });

    if (intent === 'RULES_ASK') {
      const asked = await this.ai.askRules(user, message, undefined, {
        onToken,
      });
      reply = asked.outputText;
      citations = asked.citations;
      demo = Boolean(asked.demo);
      provider = asked.provider;
      model = asked.model || model;
    } else if (intent === 'DAILY_BRIEF') {
      const built = await this.buildDailyBrief(user, todos, flow);
      reply = built.reply;
      actions.push(...built.actions);
      const polished = await this.maybePolish(
        message,
        reply,
        '根据给定数据写一份简洁的「今日会议工作简报」，分点，勿编造。',
        onToken,
      );
      if (polished) {
        reply = polished.text;
        demo = polished.demo;
        provider = polished.provider;
        model = polished.model;
      }
    } else if (intent === 'TOPIC_BRIEF') {
      const topicId =
        dto.context?.topicId || (await this.resolveTopicId(user, message));
      const built = await this.buildTopicBrief(user, topicId, message);
      reply = built.reply;
      actions.push(...built.actions);
      const polished = await this.maybePolish(
        message,
        reply,
        '根据议题事实写一页「议题简报」，分：概况、材料、审题、风险、建议下一步。禁止建议自动同意/否决。',
        onToken,
      );
      if (polished) {
        reply = polished.text;
        demo = polished.demo;
        provider = polished.provider;
        model = polished.model;
      }
    } else if (intent === 'MEETING_BRIEF') {
      const meetingId =
        dto.context?.meetingId || (await this.resolveMeetingId(user, message));
      const built = await this.buildMeetingBrief(user, meetingId);
      reply = built.reply;
      actions.push(...built.actions);
      const polished = await this.maybePolish(
        message,
        reply,
        '根据会议事实写「会中简报」：签到、法定人数、议题表决、纪要状态、下一步。勿编造票数。',
        onToken,
      );
      if (polished) {
        reply = polished.text;
        demo = polished.demo;
        provider = polished.provider;
        model = polished.model;
      }
    } else if (intent === 'RISK_EXPLAIN') {
      const built = await this.buildRiskExplain(user, dto.context, message);
      reply = built.reply;
      actions.push(...built.actions);
    } else if (intent === 'DRAFT_REVIEW_COMMENT') {
      const built = await this.buildReviewDraft(
        user,
        dto.context,
        todos,
        message,
        onToken,
      );
      reply = built.reply;
      actions.push(...built.actions);
    } else if (intent === 'MESSAGE_DIGEST') {
      const built = await this.buildMessageDigest(user);
      reply = built.reply;
      actions.push(...built.actions);
    } else if (intent === 'SUPERVISION_ALERT') {
      const built = await this.buildSupervisionAlert(user);
      reply = built.reply;
      actions.push(...built.actions);
    } else if (intent === 'SEARCH_TOPIC') {
      const built = await this.searchTopics(user, message);
      reply = built.reply;
      actions.push(...built.actions);
      // 检索结果已按会议/议题口径结构化，不再经 LLM 改写，避免口径错乱
    } else if (intent === 'STATS_ASK') {
      const built = await this.buildStatsAsk(user, message);
      reply = built.reply;
      actions.push(...built.actions);
      // 统计数字已结构化，不再经 LLM 改写，避免口径/时段被改错
    } else if (intent === 'REPORT_TODOS' || intent === 'REPORT_PROGRESS') {
      reply = this.buildReport(user, todos, flow, intent);
      actions.push(...this.todoActions(todos.items.slice(0, 5)));
      const polished = await this.maybePolish(
        message,
        reply,
        '根据待办与进度数据用简洁中文汇报，勿编造，勿建议自动审批/表决，不超过8条。',
        onToken,
      );
      if (polished) {
        reply = polished.text;
        demo = polished.demo;
        provider = polished.provider;
        model = polished.model;
      }
    } else if (intent === 'HELP_ACTION') {
      const planned = this.planHelpAction(user, message, todos, dto.context);
      reply = planned.reply;
      actions.push(...planned.actions);
    } else if (intent === 'CONTEXT_HELP' && (dto.context?.topicId || dto.context?.meetingId)) {
      if (dto.context.topicId) {
        const built = await this.buildTopicBrief(user, dto.context.topicId, message);
        reply = built.reply;
        actions.push(...built.actions);
      } else {
        const built = await this.buildMeetingBrief(user, dto.context!.meetingId!);
        reply = built.reply;
        actions.push(...built.actions);
      }
    } else {
      // 未命中专用意图：有大模型则开放问答；否则才回固定帮助模板
      // 仅当检索真正命中相关议题时才挂入口卡，避免「无结果」却列出无关卡片
      const wantTopicHint = /(议题|审题|材料|人才|实验室|经费|规划|会议)/.test(
        message,
      );
      const topicHint = wantTopicHint
        ? await this.searchTopics(user, message)
        : null;
      const open = await this.answerOpenQuestion(
        user,
        message,
        todos,
        flow,
        topicHint?.reply,
        onToken,
      );
      if (open) {
        reply = open.reply;
        demo = open.demo;
        provider = open.provider;
        model = open.model;
        if (topicHint?.actions?.length) actions.push(...topicHint.actions);
      } else if (topicHint?.actions?.length) {
        reply = topicHint.reply;
        actions.push(...topicHint.actions);
      } else if (topicHint && !topicHint.actions.length) {
        reply = topicHint.reply;
      } else {
        reply = this.buildHelpReply(todos);
        actions.push(...this.todoActions(todos.items.slice(0, 3)));
      }
    }

    // 规则答复未走模型流时，若调用方要流式展示，在此快速推送
    if (onToken && !streamed && reply) {
      const chunkSize = 48;
      for (let i = 0; i < reply.length; i += chunkSize) {
        onToken(reply.slice(i, i + chunkSize));
      }
    }

    // 去重导航动作
    const seen = new Set<string>();
    const uniqActions = actions.filter((a) => {
      const key = `${a.type}:${a.link || a.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const result: AgentChatResult = {
      sessionId,
      intent,
      reply,
      demo,
      provider,
      model,
      citations,
      actions: uniqActions,
      todosPreview: todos.items.slice(0, 8).map((t) => ({
        type: t.type,
        title: t.title,
        link: this.todoLink(t),
      })),
      disclaimer: DISCLAIMER,
    };

    await this.prisma.aiGeneration.create({
      data: {
        collegeId: user.collegeId || null,
        userId: user.sub,
        topicId: dto.context?.topicId || null,
        meetingId: dto.context?.meetingId || null,
        kind: KIND_AGENT,
        provider,
        model,
        promptVersion: PROMPT_VERSION_AGENT,
        inputDigest: message.slice(0, 2000),
        outputText: reply,
        metaJson: JSON.stringify({
          sessionId,
          intent,
          demo,
          actionIds: uniqActions.map((a) => a.id),
          actions: uniqActions,
          citations: citations || [],
          context: dto.context || null,
        }),
      },
    });

    await this.audit.log({
      user,
      action: 'AGENT_CHAT',
      resource: 'AgentSession',
      resourceId: sessionId,
      detail: { intent, demo, actionCount: uniqActions.length },
    });

    return result;
  }

  /**
   * SSE 流式对话：检索/组事实阶段后，大模型边生成边推 token。
   */
  async chatStream(
    user: AuthUser,
    dto: AgentChatDto,
    emit: (event: string, data: unknown) => void,
  ) {
    emit('status', { phase: 'thinking' });
    let streamed = false;
    let generating = false;
    const result = await this.chat(user, dto, {
      onMeta: (meta) => emit('meta', meta),
      onToken: (text) => {
        if (!generating) {
          generating = true;
          emit('status', { phase: 'generating' });
        }
        streamed = true;
        emit('token', { text });
      },
      markStreamed: () => {
        streamed = true;
      },
    });
    if (!streamed && result.reply) {
      emit('token', { text: result.reply });
    }
    emit('done', {
      sessionId: result.sessionId,
      intent: result.intent,
      reply: result.reply,
      demo: result.demo,
      provider: result.provider,
      model: result.model,
      citations: result.citations || [],
      actions: result.actions || [],
      disclaimer: result.disclaimer,
    });
  }

  /** 当前用户智能体对话历史（按时间正序） */
  async history(user: AuthUser, query?: { limit?: number }) {
    const limit = Math.min(120, Math.max(1, Number(query?.limit) || 80));
    const rows = await this.prisma.aiGeneration.findMany({
      where: { userId: user.sub, kind: KIND_AGENT },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        inputDigest: true,
        outputText: true,
        metaJson: true,
        provider: true,
        model: true,
        createdAt: true,
      },
    });
    rows.reverse();

    const messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      createdAt: string;
      citations?: AgentChatResult['citations'];
      actions?: AgentAction[];
      generationId?: string;
    }> = [];

    let sessionId = '';
    for (const row of rows) {
      let meta: any = {};
      try {
        meta = row.metaJson ? JSON.parse(row.metaJson) : {};
      } catch {
        meta = {};
      }
      if (meta.sessionId) sessionId = String(meta.sessionId);
      const userText = String(row.inputDigest || '').trim();
      if (userText) {
        messages.push({
          id: `${row.id}-u`,
          role: 'user',
          content: userText,
          createdAt: row.createdAt.toISOString(),
          generationId: row.id,
        });
      }
      const reply = String(row.outputText || '').trim();
      if (reply) {
        messages.push({
          id: `${row.id}-a`,
          role: 'assistant',
          content: reply,
          createdAt: row.createdAt.toISOString(),
          citations: Array.isArray(meta.citations) ? meta.citations : undefined,
          actions: Array.isArray(meta.actions) ? meta.actions : undefined,
          generationId: row.id,
        });
      }
    }

    return {
      sessionId: sessionId || null,
      messages,
      totalTurns: rows.length,
      disclaimer: DISCLAIMER,
    };
  }

  /** 清空当前用户智能体对话记录 */
  async clearHistory(user: AuthUser) {
    const result = await this.prisma.aiGeneration.deleteMany({
      where: { userId: user.sub, kind: KIND_AGENT },
    });
    await this.audit.log({
      user,
      action: 'AGENT_HISTORY_CLEAR',
      resource: 'AgentSession',
      resourceId: user.sub,
      detail: { deleted: result.count },
    });
    return { ok: true, deleted: result.count };
  }

  async confirm(user: AuthUser, actionId: string, dto: AgentConfirmDto) {
    const pending = this.pending.get(actionId);
    if (!pending || pending.userId !== user.sub) {
      throw new NotFoundException('确认卡不存在或已过期');
    }
    if (
      pending.action.expiresAt &&
      Date.now() > new Date(pending.action.expiresAt).getTime()
    ) {
      this.pending.delete(actionId);
      throw new BadRequestException('确认卡已过期，请重新发起');
    }

    if (!dto.approved) {
      pending.action.status = 'REJECTED';
      this.pending.delete(actionId);
      await this.audit.log({
        user,
        action: 'AGENT_ACTION_REJECT',
        resource: 'AgentAction',
        resourceId: actionId,
        detail: { type: pending.action.type },
      });
      return { ok: true, status: 'REJECTED', message: '已取消该操作' };
    }

    if (!pending.action.executable) {
      await this.audit.log({
        user,
        action: 'AGENT_ACTION_BLOCKED',
        resource: 'AgentAction',
        resourceId: actionId,
        detail: { type: pending.action.type, reason: '高风险不自动执行' },
      });
      return {
        ok: false,
        status: 'BLOCKED',
        message:
          '该操作涉及审题/表决等权力行为。请前往对应页面由您本人完成。',
        link: pending.action.link,
        action: pending.action,
      };
    }

    pending.action.status = 'EXECUTED';
    this.pending.delete(actionId);
    await this.audit.log({
      user,
      action: 'AGENT_ACTION_CONFIRM',
      resource: 'AgentAction',
      resourceId: actionId,
      detail: {
        type: pending.action.type,
        link: pending.action.link,
        comment: dto.comment || null,
      },
    });
    return {
      ok: true,
      status: 'EXECUTED',
      message: '已确认',
      link: pending.action.link,
      action: pending.action,
    };
  }

  private detectIntent(
    message: string,
    context?: AgentChatDto['context'],
  ): string {
    if (
      /规则|法定人数|表决权|回避|临时动议|缺席|双签|算不算票|三分之二|半数|列席/.test(
        message,
      )
    ) {
      return 'RULES_ASK';
    }
    if (/今日简报|今天简报|工作简报|一日汇总|今天有什么/.test(message)) {
      return 'DAILY_BRIEF';
    }
    if (/未读消息|消息摘要|有什么通知|站内信/.test(message)) {
      return 'MESSAGE_DIGEST';
    }
    if (/督办|逾期|催办情况|落实情况/.test(message) && !/帮我催|代我催/.test(message)) {
      return 'SUPERVISION_ALERT';
    }
    if (/为什么不能|无法形成决议|被阻断|风险|缺什么材料|卡在哪/.test(message)) {
      return 'RISK_EXPLAIN';
    }
    if (/审题意见|起草意见|意见草稿|帮我写.*意见/.test(message)) {
      return 'DRAFT_REVIEW_COMMENT';
    }
    if (/议题简报|这个议题|议题概况|介绍.*议题|议题怎么样/.test(message)) {
      return 'TOPIC_BRIEF';
    }
    if (/会议简报|这场会|会中情况|签到情况|表决情况|会议概况/.test(message)) {
      return 'MEETING_BRIEF';
    }
    // 数量/统计类：本月有多少党委会、议题一共几项等
    if (
      /(多少|几场|几次|几项|几个|一共|共有|有几|数量|统计)/.test(message) &&
      /(会议|议题|党组织|联席|双会|召开)/.test(message)
    ) {
      return 'STATS_ASK';
    }
    if (/本月|本学期|本年|今年|近\s*12\s*个月/.test(message) && /(召开|缺开|预警)/.test(message)) {
      return 'STATS_ASK';
    }
    if (
      /查找|搜索|有没有.*议题|有哪些.*议题|哪些议题|搜一下|和.+有关|相关议题|涉及.+议题|议题.*有关|有关.+的(?:会议|议题)|召开了?.+会议|哪些学院.*(?:会议|议题)/.test(
        message,
      )
    ) {
      return 'SEARCH_TOPIC';
    }
    if (/待办|我有什么|要处理|提醒我|汇报一下/.test(message)) {
      if (/进展|进度|进行到|流程|看板/.test(message)) return 'REPORT_PROGRESS';
      return 'REPORT_TODOS';
    }
    if (/进展|进度|进行到|流程看板/.test(message)) return 'REPORT_PROGRESS';
    if (
      /帮我|代我|提交|审批|审题|同意|反对|赞成|表决|投票|催办|签到/.test(message)
    ) {
      return 'HELP_ACTION';
    }
    if (/你好|你是谁|能做什么|帮助|怎么用/.test(message)) return 'HELP';
    if (/汇报|总结|概况/.test(message)) return 'REPORT_TODOS';
    // 在议题/会议页随口问 → 上下文简报
    if (context?.topicId || context?.meetingId) return 'CONTEXT_HELP';
    return 'OPEN_QA';
  }

  private async maybePolish(
    question: string,
    facts: string,
    systemExtra: string,
    onToken?: (text: string) => void,
  ) {
    if (!this.llm.isConfigured()) return null;
    try {
      const polished = await this.llm.chat(
        `你是高校双会议智能助理。${systemExtra} 禁止建议自动审批/表决/签署。`,
        `用户问：${question}\n\n事实材料：\n${facts}`,
        {
          demoKind: 'material_summary',
          fallbackOnNetworkError: false,
          onToken,
        },
      );
      if (polished.demo) return null;
      return polished;
    } catch {
      return null;
    }
  }

  /** 解析用户话里的时间范围 */
  private parseAskRange(message: string): {
    label: string;
    from: Date;
    to: Date;
  } {
    const now = new Date();
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    if (/本月|这个月|当月/.test(message)) {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { label: `${now.getFullYear()}年${now.getMonth() + 1}月`, from, to: end };
    }
    if (/本学期|这学期/.test(message)) {
      const m = now.getMonth() + 1;
      const from =
        m >= 2 && m <= 7
          ? new Date(now.getFullYear(), 1, 1)
          : m >= 8
            ? new Date(now.getFullYear(), 7, 1)
            : new Date(now.getFullYear() - 1, 7, 1);
      return { label: '本学期', from, to: end };
    }
    // 「一年来 / 近一年」按近 12 个月，须先于「多少→默认本月」
    if (
      /一年来|近一年来|这一年来|过去一年|近一年|一年内|近\s*一\s*年|近\s*12\s*个月|过去\s*12\s*个月/.test(
        message,
      )
    ) {
      const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return { label: '近12个月', from, to: end };
    }
    if (/本年|今年|本年度|这一年(?!来)/.test(message)) {
      const from = new Date(now.getFullYear(), 0, 1);
      return { label: `${now.getFullYear()}年`, from, to: end };
    }
    if (/全部|迄今|累计|一共有过/.test(message) && !/本月|本年|今年|一年/.test(message)) {
      return {
        label: '全部时段',
        from: new Date(2000, 0, 1),
        to: end,
      };
    }
    // 未写时段时：带「年」倾向本年，否则本月
    if (/多少|几场|几次|几项|统计/.test(message)) {
      if (/年/.test(message)) {
        const from = new Date(now.getFullYear(), 0, 1);
        return { label: `${now.getFullYear()}年`, from, to: end };
      }
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { label: `${now.getFullYear()}年${now.getMonth() + 1}月`, from, to: end };
    }
    const from = new Date(now.getFullYear(), 0, 1);
    return { label: `${now.getFullYear()}年`, from, to: end };
  }

  /** 从问句解析学院；仅限当前用户可见范围 */
  private async resolveCollegeFromMessage(user: AuthUser, message: string) {
    const visible = getVisibleCollegeIds(user);
    const colleges = await this.prisma.college.findMany({
      where:
        visible === 'ALL'
          ? {}
          : visible.length
            ? { id: { in: visible } }
            : { id: '__none__' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const hit = colleges.find(
      (c) =>
        message.includes(c.name) ||
        message.includes(c.name.replace(/学院$/, '')),
    );
    if (hit) return hit;
    return null;
  }

  private async buildStatsAsk(user: AuthUser, message: string) {
    const range = this.parseAskRange(message);
    const namedCollege = await this.resolveCollegeFromMessage(user, message);
    const collegeFilter = namedCollege
      ? { collegeId: namedCollege.id }
      : prismaCollegeIdFilter(user);
    const scopeLabel = namedCollege
      ? namedCollege.name
      : '您的可见学院范围';
    const askTopics = /议题/.test(message) && !/会议/.test(message);
    const onlyParty =
      /党组织|党委会/.test(message) && !/联席|双会/.test(message);
    const onlyJoint =
      /联席|党政联席/.test(message) && !/党组织|双会/.test(message);

    const meetingTypeFilter = onlyParty
      ? MeetingType.PARTY_COMMITTEE
      : onlyJoint
        ? MeetingType.JOINT_CONFERENCE
        : undefined;

    const dateOr = {
      OR: [
        { scheduledAt: { gte: range.from, lte: range.to } },
        { scheduledAt: null, createdAt: { gte: range.from, lte: range.to } },
      ],
    };

    const [partyMeetings, jointMeetings, partyTopics, jointTopics, sample] =
      await Promise.all([
        this.prisma.meeting.count({
          where: {
            ...collegeFilter,
            meetingType: MeetingType.PARTY_COMMITTEE,
            ...dateOr,
          },
        }),
        this.prisma.meeting.count({
          where: {
            ...collegeFilter,
            meetingType: MeetingType.JOINT_CONFERENCE,
            ...dateOr,
          },
        }),
        this.prisma.topic.count({
          where: {
            ...collegeFilter,
            meetingType: MeetingType.PARTY_COMMITTEE,
            createdAt: { gte: range.from, lte: range.to },
          },
        }),
        this.prisma.topic.count({
          where: {
            ...collegeFilter,
            meetingType: MeetingType.JOINT_CONFERENCE,
            createdAt: { gte: range.from, lte: range.to },
          },
        }),
        this.prisma.meeting.findMany({
          where: {
            ...collegeFilter,
            ...(meetingTypeFilter ? { meetingType: meetingTypeFilter } : {}),
            ...dateOr,
          },
          orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
          take: 8,
          select: {
            id: true,
            title: true,
            meetingType: true,
            scheduledAt: true,
            status: true,
            college: { select: { name: true } },
          },
        }),
      ]);

    const meetingTotal = partyMeetings + jointMeetings;
    const topicTotal = partyTopics + jointTopics;
    const focusMeetings = onlyParty
      ? partyMeetings
      : onlyJoint
        ? jointMeetings
        : meetingTotal;
    const focusTopics = onlyParty
      ? partyTopics
      : onlyJoint
        ? jointTopics
        : topicTotal;
    const typeLabel = onlyParty
      ? '党委会'
      : onlyJoint
        ? '党政联席会议'
        : '双会（党委会+联席）';

    const lines: string[] = [
      askTopics
        ? `【统计】${range.label} · ${scopeLabel} · ${typeLabel}议题`
        : `【统计】${range.label} · ${scopeLabel} · ${typeLabel}`,
      '',
      askTopics
        ? `结论：共 **${focusTopics}** 项议题。`
        : `结论：共 **${focusMeetings}** 场会议。`,
      '',
      '明细：',
      `- 党委会：${partyMeetings} 场；对应议题 ${partyTopics} 项`,
      `- 党政联席会议：${jointMeetings} 场；对应议题 ${jointTopics} 项`,
      `- 合计：会议 ${meetingTotal} 场 / 议题 ${topicTotal} 项`,
      '',
      `口径：会议按「召开时间（无则按创建时间）」落入「${range.label}」；议题按「创建时间」；范围：${scopeLabel}。`,
    ];

    if (sample.length) {
      lines.push('', '相关会议：');
      for (const m of sample) {
        const when = m.scheduledAt
          ? m.scheduledAt.toISOString().slice(0, 10)
          : '待定';
        const kind =
          m.meetingType === MeetingType.PARTY_COMMITTEE
            ? '党委会'
            : '联席';
        lines.push(
          `- [${kind}] ${m.college?.name || ''} · ${m.title}（${when} · ${STATUS_LABEL[m.status] || m.status}）`,
        );
      }
    }

    lines.push('', DISCLAIMER);

    const actions: AgentAction[] = [
      this.makeAction({
        type: 'NAVIGATE',
        title: '打开校级会议查询',
        description: '可按时间段进一步筛选',
        link: '/school-meetings',
        requiresConfirm: false,
        executable: true,
      }),
      this.makeAction({
        type: 'NAVIGATE',
        title: '打开总览',
        description: '查看部门对照与按月趋势',
        link: '/admin',
        requiresConfirm: false,
        executable: true,
      }),
    ];

    // 学院账号导航到学院会议页
    if (!user.isSchoolAdmin && !user.roles?.includes(RoleCode.SCHOOL_VIEWER)) {
      actions[0] = this.makeAction({
        type: 'NAVIGATE',
        title: '打开会议列表',
        description: '查看本院会议',
        link: '/meetings',
        requiresConfirm: false,
        executable: true,
      });
      actions[1] = this.makeAction({
        type: 'NAVIGATE',
        title: '打开待办',
        description: '继续办理会务',
        link: '/todo',
        requiresConfirm: false,
        executable: true,
      });
    }

    return { reply: lines.join('\n'), actions };
  }

  /** 开放问答：用可见业务事实喂给大模型 */
  private async answerOpenQuestion(
    user: AuthUser,
    message: string,
    todos: Awaited<ReturnType<WorkspaceService['getTodos']>>,
    flow: Awaited<ReturnType<WorkspaceService['getFlowBoard']>>,
    topicSearchFacts?: string,
    onToken?: (text: string) => void,
  ): Promise<{
    reply: string;
    demo: boolean;
    provider: string;
    model: string;
  } | null> {
    if (!this.llm.isConfigured()) return null;

    const monthFacts = await this.buildStatsAsk(user, '本月双会一共有多少会议');
    const yearFacts = await this.buildStatsAsk(user, '本年双会一共有多少会议');
    const facts = [
      `用户：${user.realName}；角色：${(user.roles || []).join(',') || '无'}`,
      `待办合计：${todos.summary.total}`,
      ...todos.items.slice(0, 8).map(
        (t) =>
          `- 待办[${TODO_TYPE_LABEL[t.type] || t.type}] ${t.title}`,
      ),
      `流程看板·联席进行中：${flow.joint.items.length}；党委会进行中：${flow.party.items.length}`,
      '',
      '本月统计事实：',
      monthFacts.reply.replace(DISCLAIMER, '').trim(),
      '',
      '本年统计事实：',
      yearFacts.reply.replace(DISCLAIMER, '').trim(),
      topicSearchFacts
        ? `\n议题检索事实：\n${topicSearchFacts.replace(DISCLAIMER, '').trim()}`
        : '',
    ].join('\n');

    try {
      const result = await this.llm.chat(
        [
          '你是曲阜师范大学二级学院双会议系统的会议智能助理。',
          '只根据「系统事实」回答；用 Markdown（标题/列表/加粗）组织，简洁中文。',
          '不确定就明说，并提示去总览/议题/会议页核对。',
          '禁止编造场次、票数、人名；禁止建议自动审批、表决或签署。',
          '若问题在问「哪些议题/相关议题」，只列检索命中的议题，不要罗列无关待办。',
        ].join('\n'),
        `用户问：${message}\n\n系统事实：\n${facts}`,
        {
          demoKind: 'material_summary',
          fallbackOnNetworkError: false,
          onToken,
        },
      );
      if (result.demo) return null;
      const disclaimerTail = `\n\n${DISCLAIMER}`;
      if (onToken) onToken(disclaimerTail);
      return {
        reply: `${result.text}${disclaimerTail}`,
        demo: false,
        provider: result.provider,
        model: result.model,
      };
    } catch {
      return null;
    }
  }

  private async buildDailyBrief(
    user: AuthUser,
    todos: Awaited<ReturnType<WorkspaceService['getTodos']>>,
    flow: Awaited<ReturnType<WorkspaceService['getFlowBoard']>>,
  ) {
    const unread = await this.notifications.unreadCount(user);
    const collegeFilter =
      user.collegeId && !user.isSchoolAdmin
        ? { collegeId: user.collegeId }
        : {};
    const upcoming = await this.prisma.meeting.findMany({
      where: {
        ...collegeFilter,
        status: { in: [MeetingStatus.SCHEDULED, MeetingStatus.IN_PROGRESS] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, status: true, meetingType: true, scheduledAt: true },
    });
    const overdue = await this.prisma.supervisionTask.count({
      where: {
        status: { not: SupervisionStatus.DONE },
        OR: [
          { status: SupervisionStatus.OVERDUE },
          { dueAt: { lt: new Date() } },
        ],
        resolution: {
          topic: collegeFilter.collegeId
            ? { collegeId: collegeFilter.collegeId }
            : undefined,
        },
      },
    });

    const lines = [
      `【今日会议工作简报】${user.realName}`,
      '',
      `1. 待办 ${todos.summary.total} 项（审题 ${todos.summary.jointReview + todos.summary.partyReview} / 纪要 ${todos.summary.minutesSign} / 督办 ${todos.summary.supervision}）`,
      `2. 未读消息 ${unread.count} 条`,
      `3. 进行中/已排期会议 ${upcoming.length} 场`,
      ...upcoming.map(
        (m) =>
          `   - ${m.title}（${STATUS_LABEL[m.status] || m.status} · ${
            m.meetingType === MeetingType.PARTY_COMMITTEE ? '党委会' : '联席会'
          }）`,
      ),
      `4. 督办逾期相关 ${overdue} 项`,
      `5. 联席流程进行中 ${flow.joint.items.length} · 党委流程进行中 ${flow.party.items.length}`,
      '',
      DISCLAIMER,
    ];

    return {
      reply: lines.join('\n'),
      actions: [
        ...this.todoActions(todos.items.slice(0, 3)),
        this.makeAction({
          type: 'NAVIGATE',
          title: '打开工作台',
          description: '查看待办与流程看板',
          link: '/workspace',
          requiresConfirm: false,
          executable: true,
        }),
        this.makeAction({
          type: 'NAVIGATE',
          title: '消息中心',
          description: `未读 ${unread.count}`,
          link: '/notifications',
          requiresConfirm: false,
          executable: true,
        }),
      ],
    };
  }

  private async buildTopicBrief(
    user: AuthUser,
    topicId: string | null,
    message: string,
  ) {
    if (!topicId) {
      const found = await this.searchTopics(user, message);
      return found;
    }
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        materials: true,
        jointReviews: {
          include: { reviewer: { select: { realName: true } } },
        },
        category: true,
        proposer: { select: { realName: true } },
        resolution: true,
        meeting: { select: { id: true, title: true, status: true } },
      },
    });
    if (!topic) {
      return { reply: '未找到该议题。', actions: [] as AgentAction[] };
    }
    if (!user.isSchoolAdmin && topic.collegeId !== user.collegeId) {
      return { reply: '无权查看该议题。', actions: [] as AgentAction[] };
    }

    const uploaded = topic.materials.filter((m) => m.uploaded);
    const risks: string[] = [];
    if (
      topic.needPartyPrecheck &&
      !topic.relatedPartyResolutionId &&
      topic.meetingType === MeetingType.JOINT_CONFERENCE
    ) {
      risks.push('已勾选党委会前置，但未关联党委决议');
    }

    const reviewLines = topic.jointReviews.length
      ? topic.jointReviews.map(
          (r) =>
            `- ${r.side}：${r.decision}（${r.reviewer?.realName || '—'}）`,
        )
      : ['- 尚未提交审题'];

    const party = topic.meetingType === MeetingType.PARTY_COMMITTEE;
    const link = `/topics/${topic.id}${party ? '?from=party' : ''}`;
    const lines = [
      `【议题简报】${topic.title}`,
      `类型：${party ? '党委会' : '联席会'} · 状态：${STATUS_LABEL[topic.status] || topic.status}`,
      `分类：${topic.category?.name || '未分类'} · 提案人：${topic.proposer?.realName || '—'}`,
      `标记：${[
        topic.isMajor ? '重大' : null,
        topic.isTempMotion ? '临时动议' : null,
        topic.isEmergency ? '紧急临机' : null,
        topic.needPartyPrecheck ? '需党委前置' : null,
      ]
        .filter(Boolean)
        .join('、') || '无特殊标记'}`,
      '',
      '材料：',
      `- 会前材料 ${topic.materials.length} 项（选填），已上传 ${uploaded.length}`,
      '',
      '审题：',
      ...reviewLines,
      '',
      '风险/关注：',
      ...(risks.length ? risks.map((r) => `- ${r}`) : ['- 暂无系统检出的硬阻断项']),
      '',
      topic.meeting
        ? `已入会议：${topic.meeting.title}（${STATUS_LABEL[topic.meeting.status] || topic.meeting.status}）`
        : '尚未入会',
      topic.resolution
        ? `已有决议：${topic.resolution.resultType}`
        : '尚无决议',
      '',
      DISCLAIMER,
    ];

    const actions: AgentAction[] = [
      this.makeAction({
        type: 'NAVIGATE',
        title: '打开议题详情',
        description: topic.title,
        link,
        requiresConfirm: false,
        executable: true,
      }),
    ];
    if (topic.meeting) {
      actions.push(
        this.makeAction({
          type: 'NAVIGATE',
          title: '打开所属会议',
          description: topic.meeting.title,
          link: `/meetings/${topic.meeting.id}${party ? '?from=party' : ''}`,
          requiresConfirm: false,
          executable: true,
        }),
      );
    }
    return { reply: lines.join('\n'), actions };
  }

  private async buildMeetingBrief(user: AuthUser, meetingId: string | null) {
    if (!meetingId) {
      return {
        reply: '请先打开一场会议，或说明会议名称。也可问「今日简报」。',
        actions: [
          this.makeAction({
            type: 'NAVIGATE',
            title: '联席会议列表',
            description: '',
            link: '/meetings',
            requiresConfirm: false,
            executable: true,
          }),
        ] as AgentAction[],
      };
    }
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        attendances: {
          include: { user: { select: { realName: true, title: true } } },
        },
        topics: {
          include: {
            resolution: true,
            votes: true,
            materials: true,
          },
        },
        minutes: { include: { signs: true } },
      },
    });
    if (!meeting) {
      return { reply: '未找到该会议。', actions: [] as AgentAction[] };
    }
    if (!user.isSchoolAdmin && meeting.collegeId !== user.collegeId) {
      return { reply: '无权查看该会议。', actions: [] as AgentAction[] };
    }

    const formal = meeting.attendances.filter((a) => a.isFormal);
    const checked = formal.filter((a) => a.checkedIn);
    const left = formal.filter((a) => a.leaveNote);
    const party = meeting.meetingType === MeetingType.PARTY_COMMITTEE;
    const from = party ? '?from=party' : '';

    const topicLines = meeting.topics.map((t) => {
      const counted = t.votes.filter((v) => v.voteCounted && !v.isAbsentOpinion);
      const approve = counted.filter((v) => v.approve).length;
      return `- ${t.title}｜决议 ${t.resolution?.resultType || '无'}｜计票赞成 ${approve}/${counted.length}`;
    });

    const lines = [
      `【会议简报】${meeting.title}`,
      `状态：${STATUS_LABEL[meeting.status] || meeting.status} · ${party ? '党委会' : '联席会'}`,
      `法定人数：${meeting.canResolve ? '已达标' : '未达标'}（到会 ${meeting.actualAttend}/${meeting.shouldAttend}${meeting.isMajor ? '，重大按2/3' : ''}）`,
      `签到：正式 ${checked.length}/${formal.length}，请假 ${left.length}`,
      '',
      '议程：',
      ...(topicLines.length ? topicLines : ['- 暂无议题']),
      '',
      '纪要：',
      meeting.minutes
        ? `- 已起草 v${meeting.minutes.version}`
        : '- 尚未起草',
      '',
      DISCLAIMER,
    ];

    return {
      reply: lines.join('\n'),
      actions: [
        this.makeAction({
          type: 'NAVIGATE',
          title: '打开会议详情',
          description: meeting.title,
          link: `/meetings/${meeting.id}${from}`,
          requiresConfirm: false,
          executable: true,
        }),
      ],
    };
  }

  private async buildRiskExplain(
    user: AuthUser,
    context: AgentChatDto['context'] | undefined,
    message: string,
  ) {
    if (context?.meetingId) {
      const brief = await this.buildMeetingBrief(user, context.meetingId);
      const meeting = await this.prisma.meeting.findUnique({
        where: { id: context.meetingId },
      });
      const blockers: string[] = [];
      if (meeting && !meeting.canResolve) {
        blockers.push(
          `到会 ${meeting.actualAttend}/${meeting.shouldAttend}，未达${
            meeting.isMajor ? '三分之二' : '半数'
          }，禁止形成决议`,
        );
      }
      if (meeting?.status === MeetingStatus.ENDED) {
        blockers.push('会议已结束，不能再签到/表决/形成决议，仅可整理纪要');
      }
      if (meeting?.status === MeetingStatus.ARCHIVED) {
        blockers.push('会议已归档，业务操作已关闭');
      }
      return {
        reply: [
          '【阻断/风险说明】',
          ...(blockers.length ? blockers.map((b) => `- ${b}`) : ['- 未发现会中硬阻断']),
          '',
          brief.reply,
        ].join('\n'),
        actions: brief.actions,
      };
    }

    const topicId =
      context?.topicId || (await this.resolveTopicId(user, message));
    if (topicId) {
      const brief = await this.buildTopicBrief(user, topicId, message);
      return {
        reply: `【风险说明】以下基于议题材料与标记自动检查：\n\n${brief.reply}`,
        actions: brief.actions,
      };
    }

    return {
      reply:
        '请打开具体议题/会议页面再问「为什么不能形成决议」或「缺什么材料」，我可以对照当前数据解释阻断原因。',
      actions: [
        this.makeAction({
          type: 'NAVIGATE',
          title: '工作台',
          description: '',
          link: '/workspace',
          requiresConfirm: false,
          executable: true,
        }),
      ],
    };
  }

  private async buildReviewDraft(
    user: AuthUser,
    context: AgentChatDto['context'] | undefined,
    todos: Awaited<ReturnType<WorkspaceService['getTodos']>>,
    message: string,
    onToken?: (text: string) => void,
  ) {
    const canReview =
      user.roles.includes(RoleCode.SECRETARY) ||
      user.roles.includes(RoleCode.DEAN) ||
      user.isSchoolAdmin;
    if (!canReview) {
      return {
        reply: '审题意见草稿仅向书记/院长开放。您可改问规则或待办。',
        actions: [] as AgentAction[],
      };
    }

    const topicId =
      context?.topicId ||
      todos.items.find(
        (t) => t.type === 'JOINT_REVIEW' || t.type === 'PARTY_REVIEW',
      )?.topicId ||
      (await this.resolveTopicId(user, message));

    if (!topicId) {
      return {
        reply: '未定位到待审议题。请打开议题详情，或先处理工作台中的审题待办。',
        actions: this.todoActions(
          todos.items.filter(
            (t) => t.type === 'JOINT_REVIEW' || t.type === 'PARTY_REVIEW',
          ),
        ),
      };
    }

    const brief = await this.buildTopicBrief(user, topicId, message);
    let draft = [
      '【审题意见草稿 · 仅供参考，须您本人修改后提交】',
      '',
      '一、材料齐备性：请对照议题简报中的缺项核对。',
      '二、程序合规：是否需党委前置、是否临时动议/紧急临机、回避是否完整。',
      '三、议事建议：同意 / 暂缓（请择一，并写明理由）。',
      '',
      '（以下为系统根据议题事实整理的要点，不构成同意或退回意见）',
      brief.reply,
    ].join('\n');

    if (this.llm.isConfigured()) {
      try {
        const polished = await this.llm.chat(
          '你是高校双会议审题秘书助手。根据议题事实起草「审题意见草稿」提纲，必须标注仅供参考、须人工确认。禁止输出「建议同意通过」作为最终结论，可列出关注点与待核实项。',
          brief.reply,
          {
            demoKind: 'material_summary',
            fallbackOnNetworkError: false,
            onToken,
          },
        );
        if (!polished.demo) {
          draft = polished.text;
          if (onToken) onToken(`\n\n${DISCLAIMER}`);
        }
      } catch {
        /* keep template */
      }
    }

    const party = brief.reply.includes('党委会');
    const action = this.makeAction({
      type: 'DRAFT_ONLY',
      title: '打开议题提交审题（本人操作）',
      description: '草稿不会自动提交；请您在议题页点击同意/暂缓',
      link: `/topics/${topicId}${party ? '?from=party' : ''}`,
      requiresConfirm: false,
      executable: true,
    });

    return { reply: `${draft}\n\n${DISCLAIMER}`, actions: [action] };
  }

  private async buildMessageDigest(user: AuthUser) {
    const list = await this.notifications.list(user, true);
    const items = Array.isArray(list) ? list : (list as any).items || [];
    const top = items.slice(0, 8);
    if (!top.length) {
      return {
        reply: '当前没有未读消息。',
        actions: [
          this.makeAction({
            type: 'NAVIGATE',
            title: '消息中心',
            description: '',
            link: '/notifications',
            requiresConfirm: false,
            executable: true,
          }),
        ],
      };
    }
    const lines = [
      `【未读消息】共 ${items.length} 条`,
      ...top.map(
        (n: any, i: number) =>
          `${i + 1}. ${n.title}${n.content ? ` — ${String(n.content).slice(0, 40)}` : ''}`,
      ),
      '',
      DISCLAIMER,
    ];
    return {
      reply: lines.join('\n'),
      actions: [
        this.makeAction({
          type: 'NAVIGATE',
          title: '打开消息中心',
          description: '',
          link: '/notifications',
          requiresConfirm: false,
          executable: true,
        }),
      ],
    };
  }

  private async buildSupervisionAlert(user: AuthUser) {
    const collegeFilter =
      user.collegeId && !user.isSchoolAdmin
        ? { collegeId: user.collegeId }
        : {};
    const tasks = await this.prisma.supervisionTask.findMany({
      where: {
        status: { not: SupervisionStatus.DONE },
        resolution: {
          topic: collegeFilter.collegeId
            ? { collegeId: collegeFilter.collegeId }
            : undefined,
        },
      },
      include: {
        owner: { select: { realName: true } },
        resolution: { include: { topic: { select: { title: true } } } },
      },
      orderBy: { dueAt: 'asc' },
      take: 20,
    });
    const now = Date.now();
    const overdue = tasks.filter(
      (t) =>
        t.status === SupervisionStatus.OVERDUE ||
        (t.dueAt && t.dueAt.getTime() < now),
    );
    const soon = tasks.filter(
      (t) =>
        t.dueAt &&
        t.dueAt.getTime() >= now &&
        t.dueAt.getTime() < now + 3 * 24 * 3600 * 1000,
    );

    const lines = [
      '【督办预警】',
      `未办结 ${tasks.length} · 逾期 ${overdue.length} · 3日内到期 ${soon.length}`,
      '',
      '逾期/临期：',
      ...(overdue.length || soon.length
        ? [...overdue, ...soon].slice(0, 8).map((t) => {
            const title = t.resolution?.topic?.title || t.title;
            const due = t.dueAt
              ? new Date(t.dueAt).toLocaleDateString('zh-CN')
              : '无期限';
            return `- ${title}｜责任人 ${t.owner?.realName || '—'}｜到期 ${due}｜催办 ${t.urgeCount || 0} 次`;
          })
        : ['- 暂无逾期或临期任务']),
      '',
      DISCLAIMER,
    ];

    return {
      reply: lines.join('\n'),
      actions: [
        this.makeAction({
          type: 'NAVIGATE',
          title: '打开决议督办',
          description: '',
          link: '/supervisions',
          requiresConfirm: false,
          executable: true,
        }),
      ],
    };
  }

  private static readonly TOPIC_STOPWORDS = new Set([
    '学院',
    '学校',
    '部门',
    '会议',
    '议题',
    '召开',
    '哪些',
    '什么',
    '有关',
    '相关',
    '一共',
    '本月',
    '本年',
    '今年',
    '双会',
    '党组织',
    '联席',
    '党政',
    '请',
    '帮我',
    '一下',
  ]);

  private extractTopicKeyword(message: string) {
    const related =
      message.match(/有关\s*(.+?)\s*的(?:会议|议题)/) ||
      message.match(/召开了?\s*(?:有关|关于)?\s*(.+?)\s*的会议/) ||
      message.match(/和\s*(.+?)\s*有关/) ||
      message.match(/关于\s*(.+?)(?:的会议|的议题|的|有|？|\?|$)/) ||
      message.match(/涉及\s*(.+?)(?:的|有|？|\?|$)/) ||
      message.match(/哪些议题.*?(?:跟|与|和)?\s*(.+?)\s*(?:有关|相关)/);
    if (related?.[1]) {
      return related[1]
        .replace(/的议题|议题|相关|有关|的会议|会议/g, '')
        .trim()
        .slice(0, 40);
    }
    const cleaned = message
      .replace(
        /查找|搜索|搜一下|有没有|有哪些|哪些学院|哪些|相关|有关|的议题|议题|的会议|会议|召开了|召开|简报|介绍|请|帮我|一下|都|什么|跟|与|和|学院/g,
        ' ',
      )
      .replace(/[？?！!，,。.\s]+/g, ' ')
      .trim();
    // 去掉停用词后取最长有意义片段
    const parts = cleaned
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(
        (p) =>
          p.length >= 2 && !AgentService.TOPIC_STOPWORDS.has(p),
      );
    if (parts.length) {
      return parts.sort((a, b) => b.length - a.length)[0].slice(0, 40);
    }
    return cleaned.slice(0, 40);
  }

  /** 关键词变体：整词 + 有意义的首尾二字（排除停用词） */
  private topicKeywordVariants(keyword: string) {
    const set = new Set<string>([keyword]);
    if (keyword.length >= 4) {
      const head = keyword.slice(0, 2);
      const tail = keyword.slice(-2);
      if (!AgentService.TOPIC_STOPWORDS.has(head)) set.add(head);
      if (!AgentService.TOPIC_STOPWORDS.has(tail)) set.add(tail);
    }
    return [...set].filter((s) => s.length >= 2);
  }

  private topicMatchesKeyword(
    title: string,
    content: string | null | undefined,
    keyword: string,
  ) {
    const text = `${title}\n${content || ''}`;
    if (text.includes(keyword)) return true;
    if (keyword.length >= 4) {
      const head = keyword.slice(0, 2);
      const tail = keyword.slice(-2);
      // 首尾若是停用词（如「学院」「会议」），禁止宽松匹配，避免全库误中
      if (
        AgentService.TOPIC_STOPWORDS.has(head) ||
        AgentService.TOPIC_STOPWORDS.has(tail)
      ) {
        return false;
      }
      return text.includes(head) && text.includes(tail);
    }
    return false;
  }

  private async searchTopics(user: AuthUser, message: string) {
    const keyword = this.extractTopicKeyword(message);
    if (
      keyword.length < 2 ||
      AgentService.TOPIC_STOPWORDS.has(keyword)
    ) {
      return {
        reply: '请给出更具体的关键词，例如：「有哪些议题和人才引进有关」。',
        actions: [] as AgentAction[],
      };
    }
    const collegeFilter = prismaCollegeIdFilter(user);
    const variants = this.topicKeywordVariants(keyword);
    const rows = await this.prisma.topic.findMany({
      where: {
        ...collegeFilter,
        OR: variants.flatMap((v) => [
          { title: { contains: v } },
          { content: { contains: v } },
        ]),
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        title: true,
        content: true,
        status: true,
        meetingType: true,
        college: { select: { id: true, name: true } },
        meetingId: true,
        meeting: {
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            college: { select: { name: true } },
          },
        },
      },
    });
    const matched = rows
      .filter((t) => this.topicMatchesKeyword(t.title, t.content, keyword))
      .slice(0, 8);

    // 「召开了…会议 / 哪些学院…会议」只回答会议，不挂未入会的议题卡
    const askMeetingOnly =
      /(?:会议|召开)/.test(message) &&
      !/(?:哪些议题|相关议题|有关的议题|议题有关|议题和)/.test(message);

    if (askMeetingOnly) {
      const meetingMap = new Map<
        string,
        {
          id: string;
          title: string;
          collegeName: string;
          topicTitles: string[];
          meetingType: string;
        }
      >();
      for (const t of matched) {
        if (!t.meeting?.id) continue;
        const prev = meetingMap.get(t.meeting.id);
        const collegeName =
          t.college?.name || t.meeting.college?.name || '—';
        if (prev) {
          prev.topicTitles.push(t.title);
        } else {
          meetingMap.set(t.meeting.id, {
            id: t.meeting.id,
            title: t.meeting.title || t.title,
            collegeName,
            topicTitles: [t.title],
            meetingType: t.meetingType,
          });
        }
      }
      const meetings = [...meetingMap.values()].slice(0, 8);
      if (!meetings.length) {
        return {
          reply: [
            `## 检索结果`,
            ``,
            `未找到与「**${keyword}**」相关、且已入会议程的会议。`,
            `（有相关议题但尚未排会时，不会出现在「会议」结果中。）`,
            ``,
            DISCLAIMER,
          ].join('\n'),
          actions: [] as AgentAction[],
        };
      }
      const colleges = [
        ...new Set(meetings.map((m) => m.collegeName).filter((n) => n && n !== '—')),
      ];
      return {
        reply: [
          `## 检索结果`,
          ``,
          `共找到 **${meetings.length}** 场与「**${keyword}**」相关的会议` +
            (colleges.length ? `，涉及学院：${colleges.join('、')}` : '') +
            `：`,
          ``,
          ...meetings.map((m, i) => {
            const kind =
              m.meetingType === MeetingType.PARTY_COMMITTEE
                ? '党委会'
                : '党政联席会议';
            return `${i + 1}. **${m.title}**（${m.collegeName} · ${kind}）\n   - 相关议题：${m.topicTitles.join('；')}`;
          }),
          ``,
          DISCLAIMER,
        ].join('\n'),
        actions: meetings.map((m) =>
          this.makeAction({
            type: 'NAVIGATE',
            title: m.title,
            description: `${m.collegeName} · 打开会议详情`,
            link: `/meetings/${m.id}`,
            requiresConfirm: false,
            executable: true,
          }),
        ),
      };
    }

    if (!matched.length) {
      return {
        reply: [
          `## 检索结果`,
          ``,
          `未找到与「**${keyword}**」相关的议题或会议（已查标题与内容）。`,
          ``,
          DISCLAIMER,
        ].join('\n'),
        actions: [] as AgentAction[],
      };
    }

    const actions = matched.map((t) =>
      this.makeAction({
        type: 'NAVIGATE',
        title: t.title,
        description: `${t.college?.name || '—'} · ${STATUS_LABEL[t.status] || t.status} · 打开议题详情`,
        link: `/topics/${t.id}${
          t.meetingType === MeetingType.PARTY_COMMITTEE ? '?from=party' : ''
        }`,
        requiresConfirm: false,
        executable: true,
      }),
    );

    const colleges = [
      ...new Set(
        matched
          .map((t) => t.college?.name || t.meeting?.college?.name || '')
          .filter(Boolean),
      ),
    ];

    return {
      reply: [
        `## 检索结果`,
        ``,
        `共找到 **${matched.length}** 项与「**${keyword}**」相关的议题` +
          (colleges.length ? `，涉及学院：${colleges.join('、')}` : '') +
          `：`,
        ``,
        ...matched.map((t, i) => {
          const kind =
            t.meetingType === MeetingType.PARTY_COMMITTEE
              ? '党委会'
              : '党政联席会议';
          const college = t.college?.name || '—';
          const meetingBit = t.meeting?.title
            ? ` · 已入会：${t.meeting.title}`
            : '';
          return `${i + 1}. **${t.title}**（${college} · ${STATUS_LABEL[t.status] || t.status} · ${kind}${meetingBit}）`;
        }),
        ``,
        DISCLAIMER,
      ].join('\n'),
      actions,
    };
  }

  private async resolveTopicId(user: AuthUser, message: string) {
    const keyword = message
      .replace(
        /议题简报|这个议题|议题概况|介绍|为什么不能|缺什么材料|风险|审题意见|起草意见|查找|搜索/g,
        '',
      )
      .trim()
      .slice(0, 40);
    if (keyword.length < 2) return null;
    const collegeFilter =
      user.collegeId && !user.isSchoolAdmin
        ? { collegeId: user.collegeId }
        : {};
    const row = await this.prisma.topic.findFirst({
      where: { ...collegeFilter, title: { contains: keyword } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return row?.id || null;
  }

  private async resolveMeetingId(user: AuthUser, message: string) {
    const keyword = message
      .replace(/会议简报|这场会|会中情况|签到情况|表决情况|会议概况/g, '')
      .trim()
      .slice(0, 40);
    const collegeFilter =
      user.collegeId && !user.isSchoolAdmin
        ? { collegeId: user.collegeId }
        : {};
    if (keyword.length >= 2) {
      const row = await this.prisma.meeting.findFirst({
        where: { ...collegeFilter, title: { contains: keyword } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (row) return row.id;
    }
    const latest = await this.prisma.meeting.findFirst({
      where: {
        ...collegeFilter,
        status: {
          in: [
            MeetingStatus.IN_PROGRESS,
            MeetingStatus.ENDED,
            MeetingStatus.SCHEDULED,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return latest?.id || null;
  }

  private buildReport(
    user: AuthUser,
    todos: Awaited<ReturnType<WorkspaceService['getTodos']>>,
    flow: Awaited<ReturnType<WorkspaceService['getFlowBoard']>>,
    intent: string,
  ) {
    const lines: string[] = [
      `${user.realName}，您好。以下是当前会议工作概况：`,
      '',
      `一、待办合计 ${todos.summary.total} 项`,
      `- 联席双审 ${todos.summary.jointReview}`,
      `- 党委会审题 ${todos.summary.partyReview}`,
      `- 纪要 ${todos.summary.minutesSign}`,
      `- 督办 ${todos.summary.supervision}`,
    ];
    if (todos.items.length) {
      lines.push('', '二、优先处理');
      for (const t of todos.items.slice(0, 5)) {
        const label = TODO_TYPE_LABEL[t.type] || t.type;
        lines.push(
          `- 【${label}】${t.title}${t.subtitle ? `（${t.subtitle}）` : ''}`,
        );
      }
    } else {
      lines.push('', '二、当前无待办。');
    }
    if (intent === 'REPORT_PROGRESS') {
      lines.push('', '三、双会流程看板');
      for (const board of [flow.joint, flow.party]) {
        lines.push(`- ${board.title}：进行中 ${board.items.length} 项`);
        for (const it of board.items.slice(0, 3)) {
          lines.push(`  · ${it.title} → ${it.stageLabel}`);
        }
      }
    }
    lines.push('', DISCLAIMER);
    return lines.join('\n');
  }

  private buildHelpReply(
    todos: Awaited<ReturnType<WorkspaceService['getTodos']>>,
  ) {
    return [
      '我是会议智能助理，可以帮您：',
      '1. 今日简报 / 待办与进展汇报',
      '2. 议题简报、会议简报、风险阻断解释',
      '3. 议事规则问答、议题搜索',
      '4. 审题意见草稿（仅草稿，须本人提交）',
      '5. 未读消息摘要、督办逾期预警',
      '6. 办理入口与确认卡引导（审题/表决不自动执行）',
      '',
      `当前待办 ${todos.summary.total} 项。试试：「今日简报」「这个议题怎么样」「为什么不能形成决议」`,
      '',
      DISCLAIMER,
    ].join('\n');
  }

  private planHelpAction(
    user: AuthUser,
    message: string,
    todos: Awaited<ReturnType<WorkspaceService['getTodos']>>,
    context?: AgentChatDto['context'],
  ): { reply: string; actions: AgentAction[] } {
    const actions: AgentAction[] = [];
    const wantsVote = /表决|投票|赞成|反对/.test(message);
    const wantsReview = /审题|审批|同意|暂缓|退回/.test(message);
    const wantsCheckin = /签到/.test(message);
    const wantsUrge = /催办/.test(message);

    if (wantsVote) {
      const meetingId =
        context?.meetingId ||
        todos.items.find((t) => t.meetingId)?.meetingId;
      const action = this.makeAction({
        type: 'CONFIRM_VOTE',
        title: '表决需本人确认（不自动提交）',
        description:
          '表决属于权力行为。请打开会议详情，由您本人点击赞成/反对。',
        link: meetingId ? `/meetings/${meetingId}` : '/meetings',
        requiresConfirm: true,
        executable: false,
        payload: { requestedBy: user.sub, hint: message },
      });
      this.trackPending(user, action);
      actions.push(action);
      return {
        reply: [
          '收到。表决必须由您本人完成，我不能代为决定票面。',
          '请前往会议详情页提交赞成/反对；需要的话我可以先给您「会议简报」。',
          '',
          DISCLAIMER,
        ].join('\n'),
        actions,
      };
    }

    if (wantsReview) {
      const item =
        todos.items.find((t) => t.type === 'JOINT_REVIEW') ||
        todos.items.find((t) => t.type === 'PARTY_REVIEW');
      const topicId = context?.topicId || item?.topicId;
      const action = this.makeAction({
        type: 'CONFIRM_REVIEW',
        title: '审题需本人确认（不自动提交）',
        description: item
          ? `待办：${item.title}`
          : '请打开议题详情本人点击同意/暂缓',
        link: topicId
          ? `/topics/${topicId}${item?.type === 'PARTY_REVIEW' ? '?from=party' : ''}`
          : '/workspace',
        requiresConfirm: true,
        executable: false,
        payload: { topicId, hint: message },
      });
      this.trackPending(user, action);
      actions.push(action);
      return {
        reply: [
          '审题须您本人确认。我可先帮您生成「审题意见草稿」，但不会自动提交。',
          item ? `已定位待办「${item.title}」。` : '暂未找到待审题项。',
          '',
          DISCLAIMER,
        ].join('\n'),
        actions,
      };
    }

    if (wantsCheckin) {
      const item = todos.items.find((t) => t.type === 'CHECKIN');
      actions.push(
        this.makeAction({
          type: 'NAVIGATE',
          title: item ? `去签到：${item.title}` : '打开会议列表',
          description: '进入会议详情后点击「本人签到」',
          link: item?.meetingId ? `/meetings/${item.meetingId}` : '/meetings',
          requiresConfirm: false,
          executable: true,
        }),
      );
      return {
        reply: item
          ? `您有待签到会议「${item.title}」。请打开会议详情完成签到。`
          : '当前没有待签到会议。',
        actions,
      };
    }

    if (wantsUrge) {
      const item = todos.items.find((t) => t.type === 'SUPERVISION');
      const action = this.makeAction({
        type: 'CONFIRM_URGE',
        title: '催办需确认（请在督办页操作）',
        description: item ? `督办：${item.title}` : '请到决议督办页面操作',
        link: '/supervisions',
        requiresConfirm: true,
        executable: false,
        payload: { taskId: item?.taskId },
      });
      this.trackPending(user, action);
      actions.push(action);
      return {
        reply:
          '催办请在「决议督办」页面由您确认后发送。可先问我「督办预警」查看逾期情况。',
        actions,
      };
    }

    actions.push(...this.todoActions(todos.items.slice(0, 5)));
    return { reply: this.buildHelpReply(todos), actions };
  }

  private todoActions(
    items: Array<{
      type: string;
      title: string;
      topicId?: string;
      meetingId?: string;
      taskId?: string;
    }>,
  ): AgentAction[] {
    return items.map((t) =>
      this.makeAction({
        type: 'NAVIGATE',
        title: `${TODO_TYPE_LABEL[t.type] || t.type}：${t.title}`,
        description: '打开对应页面处理',
        link: this.todoLink(t),
        requiresConfirm: false,
        executable: true,
      }),
    );
  }

  private todoLink(t: {
    type: string;
    topicId?: string;
    meetingId?: string;
  }) {
    if (t.type === 'SUPERVISION') return '/supervisions';
    if (t.meetingId) return `/meetings/${t.meetingId}`;
    if (t.topicId) {
      const party = t.type === 'PARTY_REVIEW' ? '?from=party' : '';
      return `/topics/${t.topicId}${party}`;
    }
    return '/workspace';
  }

  private makeAction(input: {
    type: AgentAction['type'];
    title: string;
    description: string;
    link?: string;
    requiresConfirm: boolean;
    executable: boolean;
    payload?: Record<string, unknown>;
  }): AgentAction {
    const id = randomUUID();
    return {
      id,
      type: input.type,
      title: input.title,
      description: input.description,
      status: input.requiresConfirm ? 'PENDING_CONFIRM' : 'SUGGESTED',
      link: input.link,
      payload: input.payload,
      requiresConfirm: input.requiresConfirm,
      executable: input.executable,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  private trackPending(user: AuthUser, action: AgentAction) {
    this.pending.set(action.id, {
      action,
      userId: user.sub,
      createdAt: Date.now(),
    });
  }
}
