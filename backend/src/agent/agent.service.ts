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
import { AgentChatDto, AgentConfirmDto } from './dto/agent.dto';
import { AgentAction, AgentChatResult } from './agent.types';

const PROMPT_VERSION_AGENT = 'agent-chat-v2';
const KIND_AGENT = 'AGENT_CHAT';
const DISCLAIMER =
  '智能助理仅辅助汇报与查询；审题、表决、签署等须您本人确认。AI 不替代制度审签。';

const TODO_TYPE_LABEL: Record<string, string> = {
  JOINT_REVIEW: '联席审题',
  PARTY_REVIEW: '党组织审题',
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

  async chat(user: AuthUser, dto: AgentChatDto): Promise<AgentChatResult> {
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

    if (intent === 'RULES_ASK') {
      const asked = await this.ai.askRules(user, message);
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
      const built = await this.buildReviewDraft(user, dto.context, todos, message);
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
    } else if (intent === 'REPORT_TODOS' || intent === 'REPORT_PROGRESS') {
      reply = this.buildReport(user, todos, flow, intent);
      actions.push(...this.todoActions(todos.items.slice(0, 5)));
      const polished = await this.maybePolish(
        message,
        reply,
        '根据待办与进度数据用简洁中文汇报，勿编造，勿建议自动审批/表决，不超过8条。',
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
      reply = this.buildHelpReply(todos);
      actions.push(...this.todoActions(todos.items.slice(0, 3)));
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
        inputDigest: message.slice(0, 500),
        outputText: reply,
        metaJson: JSON.stringify({
          sessionId,
          intent,
          demo,
          actionIds: uniqActions.map((a) => a.id),
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
    if (/查找|搜索|有没有.*议题|搜一下/.test(message)) {
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
    return 'HELP';
  }

  private async maybePolish(question: string, facts: string, systemExtra: string) {
    if (!this.llm.isConfigured()) return null;
    try {
      const polished = await this.llm.chat(
        `你是高校双会议智能助理。${systemExtra} 禁止建议自动审批/表决/签署。`,
        `用户问：${question}\n\n事实材料：\n${facts}`,
        { demoKind: 'material_summary' },
      );
      if (polished.demo) return null;
      return polished;
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
            m.meetingType === MeetingType.PARTY_COMMITTEE ? '党组织会议' : '联席会'
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
      risks.push('已勾选党组织会议前置，但未关联党委决议');
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
      `类型：${party ? '党组织会议' : '联席会'} · 状态：${STATUS_LABEL[topic.status] || topic.status}`,
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
      `状态：${STATUS_LABEL[meeting.status] || meeting.status} · ${party ? '党组织会议' : '联席会'}`,
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
          { demoKind: 'material_summary' },
        );
        if (!polished.demo) draft = polished.text;
      } catch {
        /* keep template */
      }
    }

    const party = brief.reply.includes('党组织会议');
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

  private async searchTopics(user: AuthUser, message: string) {
    const keyword = message
      .replace(/查找|搜索|有没有|搜一下|议题|简报|介绍/g, '')
      .trim()
      .slice(0, 40);
    if (keyword.length < 2) {
      return {
        reply: '请给出议题关键词，例如：「查找实验室设备」。',
        actions: [] as AgentAction[],
      };
    }
    const collegeFilter =
      user.collegeId && !user.isSchoolAdmin
        ? { collegeId: user.collegeId }
        : {};
    const rows = await this.prisma.topic.findMany({
      where: {
        ...collegeFilter,
        title: { contains: keyword },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        title: true,
        status: true,
        meetingType: true,
      },
    });
    if (!rows.length) {
      return {
        reply: `未找到标题含「${keyword}」的议题。`,
        actions: [] as AgentAction[],
      };
    }
    const actions = rows.map((t) =>
      this.makeAction({
        type: 'NAVIGATE',
        title: t.title,
        description: STATUS_LABEL[t.status] || t.status,
        link: `/topics/${t.id}${
          t.meetingType === MeetingType.PARTY_COMMITTEE ? '?from=party' : ''
        }`,
        requiresConfirm: false,
        executable: true,
      }),
    );
    return {
      reply: [
        `找到 ${rows.length} 条相关议题（关键词：${keyword}）：`,
        ...rows.map(
          (t, i) =>
            `${i + 1}. ${t.title}（${STATUS_LABEL[t.status] || t.status}）`,
        ),
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
      `- 党组织审题 ${todos.summary.partyReview}`,
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
