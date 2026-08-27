import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { MeetingType } from '../common/constants';
import { materialsForCategory } from '../topics/material-templates';
import { LlmProvider } from './llm.provider';
import { RulesRagService } from './rules-rag.service';

const PROMPT_VERSION_SUMMARY = 'material-summary-v1';
const PROMPT_VERSION_MINUTES = 'minutes-draft-v1';
const PROMPT_VERSION_RULES = 'rules-ask-v1';
const PROMPT_VERSION_ASSIST = 'assist-create-v1';
const PROMPT_VERSION_BRIEF = 'review-brief-v1';
const KIND_SUMMARY = 'MATERIAL_SUMMARY';
const KIND_MINUTES = 'MINUTES_DRAFT';
const KIND_RULES = 'RULES_ASK';
const KIND_ASSIST = 'ASSIST_CREATE';
const KIND_BRIEF = 'REVIEW_BRIEF';
const MAX_CHARS_PER_FILE = 6000;
const MAX_TOTAL_CHARS = 18000;

/** 分类推荐关键词（code → 命中词） */
const CATEGORY_HINTS: Record<string, string[]> = {
  REFORM: ['改革', '发展', '稳定', '规划', '体制', '机制'],
  FACULTY: ['教师', '师资', '人才', '引进', '编制', '人事', '高层次'],
  STUDENT: ['学生', '培养', '招生', '学工', '就业', '思政'],
  RESEARCH: ['科研', '课题', '实验室', '学术', '项目', '成果'],
  COOP: ['合作', '交流', '协议', '共建', '校企', '国际'],
  GOVERNANCE: ['委员会', '人选', '换届', '推荐', '理事'],
  AWARD: ['表彰', '奖励', '评优', '先进', '荣誉'],
  OTHER: ['其他'],
  PARTY_TRANSFER: ['转办', '落实', '党委决议'],
  PARTY_BUILD: ['党建', '组织建设', '支部', '党员', '廉政', '巡视', '整改', '纪律'],
  CADRE: ['干部', '选拔', '任用', '任免', '岗位'],
  TALENT: ['人才引进', '政治引领', '联系服务', '人才培养'],
  IDEOLOGY_EDU: ['思政课', '课程思政', '思想政治工作', '育人'],
  MORAL: ['师德', '师风', '教风', '学风'],
  IDEOLOGY: ['意识形态', '统战', '宣传', '安全稳定'],
  MASS_ORG: ['工会', '共青团', '学生会', '教代会', '离退休', '老干部'],
  PARTY_OTHER: ['其他党建'],
};

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly llm: LlmProvider,
    private readonly rulesRag: RulesRagService,
  ) {}

  status() {
    return {
      ...this.llm.status(),
      capabilities: [
        'MATERIAL_SUMMARY',
        'MINUTES_DRAFT',
        'RULES_ASK',
        'ASSIST_CREATE',
        'REVIEW_BRIEF',
      ],
      promptVersions: {
        MATERIAL_SUMMARY: PROMPT_VERSION_SUMMARY,
        MINUTES_DRAFT: PROMPT_VERSION_MINUTES,
        RULES_ASK: PROMPT_VERSION_RULES,
        ASSIST_CREATE: PROMPT_VERSION_ASSIST,
        REVIEW_BRIEF: PROMPT_VERSION_BRIEF,
      },
      note: this.llm.isConfigured()
        ? '已配置大模型，将调用远程 API 生成'
        : '未配置 LLM_API_KEY，当前为本地演示生成',
    };
  }

  listRuleTopics() {
    return this.rulesRag.list();
  }

  async getLatestMaterialSummary(user: AuthUser, topicId: string) {
    const topic = await this.assertTopicAccess(user, topicId);
    const latest = await this.prisma.aiGeneration.findFirst({
      where: { topicId, kind: KIND_SUMMARY },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return { topicId: topic.id, summary: null };
    return {
      topicId: topic.id,
      summary: this.toView(latest),
    };
  }

  async summarizeTopicMaterials(user: AuthUser, topicId: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        materials: true,
        category: true,
        proposer: { select: { realName: true } },
      },
    });
    if (!topic) throw new NotFoundException('议题不存在');
    if (!user.isSchoolAdmin && topic.collegeId !== user.collegeId) {
      throw new ForbiddenException('无权操作该议题');
    }

    const uploaded = topic.materials.filter(
      (m) =>
        m.uploaded &&
        m.filePath &&
        !String(m.filePath).startsWith('party-resolution://'),
    );
    if (!uploaded.length) {
      throw new BadRequestException('尚无已上传材料，请先上传后再生成摘要');
    }

    const excerpts: { name: string; text: string; note?: string }[] = [];
    let total = 0;
    for (const m of uploaded) {
      if (total >= MAX_TOTAL_CHARS) break;
      const extracted = this.extractMaterialText(m.filePath!, m.originalName);
      const slice = extracted.text.slice(0, MAX_CHARS_PER_FILE);
      total += slice.length;
      excerpts.push({
        name: m.name,
        text: slice || '（未能提取文本）',
        note: extracted.note,
      });
    }

    const meetingLabel =
      topic.meetingType === MeetingType.PARTY_COMMITTEE
        ? '党委会'
        : '党政联席会';

    const userPrompt = [
      `议题标题：${topic.title}`,
      `会议类型：${meetingLabel}`,
      `议题分类：${topic.category?.name || '未分类'}`,
      `提案人：${topic.proposer?.realName || '—'}`,
      topic.content ? `议题说明：${topic.content}` : '',
      '',
      '以下为会前材料摘录（可能截断）：',
      ...excerpts.map(
        (e) =>
          `【材料：${e.name}】${e.note ? `（${e.note}）` : ''}\n${e.text}`,
      ),
    ]
      .filter(Boolean)
      .join('\n');

    const systemPrompt = [
      '你是高校二级学院党委会/党政联席会议务辅读助手。',
      '根据议题与材料摘录，生成供书记/院长/委员会前阅读的「一页纸摘要」。',
      '要求：',
      '1. 使用中文，分节：背景与诉求、关键影响、材料齐备与缺项、审题关注点、声明。',
      '2. 不确定处明确写「原文未提及/需人工核对」，禁止编造数字与结论。',
      '3. 不得给出「建议同意/建议否决」等替代审批的结论。',
      '4. 文末声明：AI 辅助生成，须人工核对，以制度与原文为准。',
    ].join('\n');

    const result = await this.llm.chat(systemPrompt, userPrompt, {
      demoKind: 'material_summary',
    });

    const meta = {
      materialCount: uploaded.length,
      excerptCount: excerpts.length,
      excerptNames: excerpts.map((e) => e.name),
      extractNotes: excerpts.map((e) => ({ name: e.name, note: e.note || null })),
      demo: result.demo,
    };

    const row = await this.prisma.aiGeneration.create({
      data: {
        collegeId: topic.collegeId,
        topicId: topic.id,
        userId: user.sub,
        kind: KIND_SUMMARY,
        provider: result.provider,
        model: result.model,
        promptVersion: PROMPT_VERSION_SUMMARY,
        inputDigest: userPrompt.slice(0, 2000),
        outputText: result.text,
        metaJson: JSON.stringify(meta),
      },
    });

    await this.audit.log({
      user,
      action: 'AI_MATERIAL_SUMMARY',
      resource: 'Topic',
      resourceId: topic.id,
      detail: {
        generationId: row.id,
        provider: result.provider,
        model: result.model,
        demo: result.demo,
      },
    });

    return this.toView(row);
  }

  async getLatestMinutesDraft(user: AuthUser, meetingId: string) {
    const meeting = await this.assertMeetingAccess(user, meetingId);
    const latest = await this.prisma.aiGeneration.findFirst({
      where: { meetingId, kind: KIND_MINUTES },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return { meetingId: meeting.id, draft: null };
    return { meetingId: meeting.id, draft: this.toView(latest) };
  }

  async draftMeetingMinutes(user: AuthUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        topics: {
          include: {
            resolution: true,
            votes: true,
            discussions: {
              include: {
                user: { select: { realName: true, title: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        attendances: {
          include: {
            user: { select: { realName: true, title: true } },
          },
        },
        minutes: true,
      },
    });
    if (!meeting) throw new NotFoundException('会议不存在');
    if (!user.isSchoolAdmin && meeting.collegeId !== user.collegeId) {
      throw new ForbiddenException('无权操作该会议');
    }
    if (!meeting.topics.length) {
      throw new BadRequestException('会议尚无议题，无法生成纪要');
    }

    const meetingLabel =
      meeting.meetingType === MeetingType.PARTY_COMMITTEE
        ? '党委会'
        : '党政联席会';

    const orderedTopics = [...meeting.topics].sort((a, b) => {
      if (a.id === meeting.firstTopicId) return -1;
      if (b.id === meeting.firstTopicId) return 1;
      return a.sortOrder - b.sortOrder;
    });
    const topicBlocks = orderedTopics.map((t, idx) => {
      const res = t.resolution;
      return [
        `【议题${idx + 1}：${t.title}】`,
        `状态：${t.status}`,
        res
          ? `会后登记决议：${res.resultType}；${res.content || '—'}${
              res.isPublic ? '；按规定公开' : ''
            }`
          : '决议：尚未登记',
      ].join('\n');
    });

    const userPrompt = [
      `会议标题：${meeting.title}`,
      `会议类型：${meetingLabel}`,
      meeting.periodNo ? `期次：${meeting.periodNo}` : '',
      meeting.scheduledAt
        ? `预定时间：${meeting.scheduledAt.toISOString()}`
        : '',
      '',
      '议题与会后决议（本系统不记录现场签到与表决过程）：',
      ...topicBlocks,
      meeting.minutes?.content
        ? `\n现有纪要正文（供参考，可改写）：\n${meeting.minutes.content.slice(0, 2000)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const systemPrompt = [
      '你是高校二级学院双会议会务秘书助手，根据议题与会后登记的决议起草纪要初稿。',
      '要求：',
      '1. 使用规范公文中文，分节：会议概况、议题议决、其他事项、附注。',
      '2. 忠实于给定的议题标题与决议内容，禁止编造未出现的人名、票数、到会人数。',
      '3. 不要编写现场签到、举手表决等过程细节。',
      '4. 文末注明：本稿为 AI 辅助初稿，须秘书核对后保存。系统不办理线上签署生效。',
      '5. 不要输出「建议通过/建议否决」等替代会议结论的语句。',
      '6. 已指定的第一议题必须写在所有议题的第一位，不得调整到其他位置。',
    ].join('\n');

    const result = await this.llm.chat(systemPrompt, userPrompt, {
      demoKind: 'minutes_draft',
    });

    const meta = {
      topicCount: orderedTopics.length,
      hasResolution: orderedTopics.some((t) => !!t.resolution),
      demo: result.demo,
      meetingType: meeting.meetingType,
    };

    const row = await this.prisma.aiGeneration.create({
      data: {
        collegeId: meeting.collegeId,
        meetingId: meeting.id,
        userId: user.sub,
        kind: KIND_MINUTES,
        provider: result.provider,
        model: result.model,
        promptVersion: PROMPT_VERSION_MINUTES,
        inputDigest: userPrompt.slice(0, 2000),
        outputText: result.text,
        metaJson: JSON.stringify(meta),
      },
    });

    await this.audit.log({
      user,
      action: 'AI_MINUTES_DRAFT',
      resource: 'Meeting',
      resourceId: meeting.id,
      detail: {
        generationId: row.id,
        provider: result.provider,
        model: result.model,
        demo: result.demo,
      },
    });

    return this.toView(row);
  }

  async askRules(user: AuthUser, question: string, collegeId?: string) {
    const q = question.trim();
    if (q.length < 2) {
      throw new BadRequestException('请输入问题');
    }

    const hits = this.rulesRag.retrieve(q, 4);
    const citations = hits.map((h) => ({
      id: h.chunk.id,
      title: h.chunk.title,
      source: h.chunk.source,
      score: h.score,
      excerpt: h.chunk.content,
    }));

    let text: string;
    let provider: string;
    let model: string;
    let demo: boolean;

    if (!hits.length) {
      text = this.rulesRag.demoAnswer(q, hits);
      provider = this.llm.isConfigured() ? 'rag' : 'demo';
      model = 'rules-kb';
      demo = !this.llm.isConfigured();
    } else if (!this.llm.isConfigured()) {
      text = this.rulesRag.demoAnswer(q, hits);
      provider = 'demo';
      model = 'rules-kb';
      demo = true;
    } else {
      const context = hits
        .map(
          (h, i) =>
            `[${i + 1}] ${h.chunk.title}｜${h.chunk.source}\n${h.chunk.content}`,
        )
        .join('\n\n');
      const system = [
        '你是曲阜师范大学二级学院双会议议事规则助手。',
        '只根据给定「制度摘录」回答用户问题，使用中文，简洁分点。',
        '每条结论后用（出处：…）标注对应 source。',
        '若摘录不足以回答，明确说不确定，并建议咨询学院办公室或党委组织部。',
        '禁止编造条文编号或未给出的规定；禁止给出「建议同意/否决」等替代审批结论。',
      ].join('\n');
      const userPrompt = `用户问题：${q}\n\n制度摘录：\n${context}`;
      const result = await this.llm.chat(system, userPrompt, {
        demoKind: 'material_summary',
      });
      // 若走了 demo 回退（不应发生，因已配置），仍可用
      text = result.text;
      provider = result.provider;
      model = result.model;
      demo = result.demo;
    }

    const meta = {
      question: q,
      citationIds: citations.map((c) => c.id),
      citationCount: citations.length,
      demo,
    };

    const row = await this.prisma.aiGeneration.create({
      data: {
        collegeId: collegeId || user.collegeId || null,
        userId: user.sub,
        kind: KIND_RULES,
        provider,
        model,
        promptVersion: PROMPT_VERSION_RULES,
        inputDigest: q.slice(0, 500),
        outputText: text,
        metaJson: JSON.stringify(meta),
      },
    });

    await this.audit.log({
      user,
      action: 'AI_RULES_ASK',
      resource: 'AiGeneration',
      resourceId: row.id,
      detail: {
        question: q.slice(0, 200),
        citationIds: meta.citationIds,
        provider,
        demo,
      },
    });

    return {
      ...this.toView(row),
      question: q,
      citations,
    };
  }

  /** 议题征集辅助：由自然语言描述生成标题/内容/分类建议（须人确认） */
  async assistCreate(
    user: AuthUser,
    dto: {
      title?: string;
      content?: string;
      description?: string;
      meetingType?: string;
    },
  ) {
    const meetingType =
      dto.meetingType || MeetingType.JOINT_CONFERENCE;
    const description = (dto.description || '').trim();
    let title = (dto.title || '').trim();
    let content = (dto.content || '').trim();

    if (!title && !description) {
      throw new BadRequestException('请填写议题描述或标题');
    }

    // 由描述生成标题与内容（有大模型则调用；否则用规则草稿）
    let suggestedTitle = title;
    let suggestedContent = content;
    if (description) {
      const drafted = await this.draftTopicFromDescription(
        meetingType,
        description,
      );
      suggestedTitle = drafted.title;
      suggestedContent = drafted.content;
      if (!title) title = suggestedTitle;
      if (!content) content = suggestedContent;
    }

    const text = `${description}\n${title}\n${content}`;

    const categories = await this.prisma.categoryDict.findMany({
      where: {
        meetingType,
        OR: [
          { collegeId: null },
          ...(user.collegeId ? [{ collegeId: user.collegeId }] : []),
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });

    const scored = categories
      .map((c) => {
        const hints = CATEGORY_HINTS[c.code] || [c.name];
        let score = 0;
        for (const h of hints) {
          if (h && text.includes(h)) score += 3;
        }
        if (c.name && text.includes(c.name)) score += 4;
        if (c.code && text.toUpperCase().includes(c.code)) score += 2;
        return { category: c, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0]?.score > 0 ? scored[0] : null;
    const suggestedCategory = best?.category || categories[0] || null;
    const materials = materialsForCategory(
      meetingType,
      suggestedCategory?.code,
    );

    const suggestions = {
      needPartyPrecheck: false,
      isMajor: false,
      isTempMotion: false,
      isEmergency: false,
      reasons: [] as string[],
    };

    if (meetingType === MeetingType.JOINT_CONFERENCE) {
      if (
        /干部|人才引进|教师队伍|办学方向|师生.*利益|意识形态|党建/.test(text)
      ) {
        suggestions.needPartyPrecheck = true;
        suggestions.reasons.push(
          '描述涉及办学方向、队伍建设或师生利益等，建议勾选「党委会前置」并关联党委决议',
        );
      }
      if (suggestedCategory?.code === 'PARTY_TRANSFER' || suggestedCategory?.needPrecheck) {
        suggestions.needPartyPrecheck = true;
        suggestions.reasons.push('所选/推荐分类通常需要党委会前置材料');
      }
    }

    if (/重大|大额|预算|编制|规划|战略/.test(text)) {
      suggestions.isMajor = true;
      suggestions.reasons.push('出现重大/预算/编制等表述，建议勾选「重大事项」（影响法定人数口径）');
    }
    if (/临时动议|临时议题|会中新增/.test(text)) {
      suggestions.isTempMotion = true;
      suggestions.reasons.push('疑似临时动议，须书记/院长审签并上传动议说明');
    }
    if (/紧急|临机|事后补报/.test(text)) {
      suggestions.isEmergency = true;
      suggestions.reasons.push('疑似紧急临机处置，须上传说明并事后双签补确认');
    }
    if (!suggestions.reasons.length) {
      suggestions.reasons.push('未检测到强特征标记，请按实际事项人工确认分类与开关');
    }

    let narrative = '';
    if (this.llm.isConfigured()) {
      try {
        const result = await this.llm.chat(
          '你是高校双会议议题征集助手。根据描述与建议，用不超过5条中文要点说明征集注意点。不要替用户做最终决定，不要编造制度条文编号。',
          `会议类型：${meetingType}\n描述：${description || '无'}\n标题：${title}\n内容：${content || '无'}\n推荐分类：${suggestedCategory?.name || '无'}\n建议标记：${JSON.stringify(suggestions)}`,
          { demoKind: 'material_summary' },
        );
        if (!result.demo) narrative = result.text;
      } catch {
        /* 辅助失败不阻断 */
      }
    }
    if (!narrative) {
      narrative = [
        `推荐分类：${suggestedCategory?.name || '请手动选择'}`,
        ...suggestions.reasons,
        `建议材料（选填）：${materials.map((m) => m.name).join('、') || '—'}`,
        '以上为 AI/规则建议，提交前请人工确认。',
      ].join('\n');
    }

    const payload = {
      meetingType,
      suggestedTitle,
      suggestedContent,
      suggestedCategoryId: suggestedCategory?.id || null,
      suggestedCategoryCode: suggestedCategory?.code || null,
      suggestedCategoryName: suggestedCategory?.name || null,
      categoryCandidates: scored.slice(0, 3).map((s) => ({
        id: s.category.id,
        code: s.category.code,
        name: s.category.name,
        score: s.score,
      })),
      materials,
      suggestions,
      narrative,
    };

    const row = await this.prisma.aiGeneration.create({
      data: {
        collegeId: user.collegeId || null,
        userId: user.sub,
        kind: KIND_ASSIST,
        provider: this.llm.isConfigured() ? 'openai_compatible' : 'demo',
        model: this.llm.isConfigured()
          ? this.llm.status().model
          : 'rules-heuristic',
        promptVersion: PROMPT_VERSION_ASSIST,
        inputDigest: text.slice(0, 500),
        outputText: narrative,
        metaJson: JSON.stringify({
          ...payload,
          demo: !this.llm.isConfigured(),
        }),
      },
    });

    await this.audit.log({
      user,
      action: 'AI_ASSIST_CREATE',
      resource: 'AiGeneration',
      resourceId: row.id,
      detail: {
        meetingType,
        suggestedCategoryCode: payload.suggestedCategoryCode,
      },
    });

    return {
      ...this.toView(row),
      ...payload,
      demo: !this.llm.isConfigured(),
    };
  }

  /** 从自然语言描述起草标题与正文 */
  private async draftTopicFromDescription(
    meetingType: string,
    description: string,
  ): Promise<{ title: string; content: string }> {
    const fallbackTitle = (() => {
      const line = description.split(/[\n。！？；;]/).map((s) => s.trim()).find(Boolean) || description;
      const t = line.replace(/^关于/, '').trim();
      if (t.length <= 36) return t.startsWith('关于') ? t : `关于${t}`;
      return `关于${t.slice(0, 32)}…`;
    })();
    const fallbackContent = [
      '一、背景与现状',
      description,
      '',
      '二、政策依据',
      '（请补充适用的上级文件、学校制度或学院规定，注明文号/条款）',
      '',
      '三、拟提请事项',
      '（请具体列明本次会议拟讨论决定的事项，如涉及人员/经费/时间节点请写明）',
      '',
      '四、预期影响与落实安排',
      '（请说明实施后对学院工作的影响，以及责任部门、完成时限）',
    ].join('\n');

    if (!this.llm.isConfigured()) {
      return { title: fallbackTitle, content: fallbackContent };
    }

    try {
      const result = await this.llm.chat(
        [
          '你是高校学院双会议议题起草助手，服务对象为学院办公室/党委秘书。',
          '根据用户的自然语言描述，起草一份可直接提交会议的规范议题稿。',
          '只输出 JSON 对象，字段为 title、content，不要 Markdown 代码块标记，不要解释文字。',
          'title：简洁准确，一般不超过 40 字，以"关于…的请示/报告/议案"等公文式表述为佳。',
          'content：结构完整，约 180～280 字，按四段分节（用"一、二、三、四、"作序号）：',
          '（1）背景与现状——概述事项由来、现状与必要性；',
          '（2）政策依据——概括适用制度，不得编造具体文号/条款编号；',
          '（3）拟提请事项——列明本次会议拟讨论决定的内容；',
          '（4）预期影响与落实安排——影响面、责任分工与时限（未知处用"（需人工补充）"）。',
          '严禁编造描述中未出现的人名、金额、文件编号。',
        ].join('\n'),
        `会议类型：${meetingType === 'PARTY_COMMITTEE' ? '党委会' : '党政联席会议'}\n用户描述：\n${description}`,
        { demoKind: 'material_summary' },
      );
      if (result.demo) {
        return { title: fallbackTitle, content: fallbackContent };
      }
      const parsed = this.parseJsonObject(result.text) as {
        title?: string;
        content?: string;
      } | null;
      return {
        title: String(parsed?.title || fallbackTitle).trim().slice(0, 80),
        content: String(parsed?.content || fallbackContent).trim(),
      };
    } catch {
      return { title: fallbackTitle, content: fallbackContent };
    }
  }

  private parseJsonObject(raw: string): Record<string, unknown> | null {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    try {
      const v = JSON.parse(stripped);
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch {
      /* continue */
    }
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const v = JSON.parse(stripped.slice(start, end + 1));
        if (v && typeof v === 'object') return v as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }

  /** 审题简报：材料齐备、前置、同类历史、关注点（只读辅读） */
  async reviewBrief(user: AuthUser, topicId: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        materials: true,
        category: true,
        proposer: { select: { realName: true, title: true } },
        jointReviews: {
          include: { reviewer: { select: { realName: true } } },
        },
        transferFrom: {
          include: {
            sourceTopic: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });
    if (!topic) throw new NotFoundException('议题不存在');
    if (!user.isSchoolAdmin && topic.collegeId !== user.collegeId) {
      throw new ForbiddenException('无权查看');
    }

    const uploaded = topic.materials.filter((m) => m.uploaded);

    const similar = await this.prisma.topic.findMany({
      where: {
        collegeId: topic.collegeId,
        meetingType: topic.meetingType,
        id: { not: topic.id },
        OR: [
          topic.categoryId ? { categoryId: topic.categoryId } : undefined,
          { title: { contains: topic.title.slice(0, 8) } },
        ].filter(Boolean) as any,
      },
      include: {
        resolution: true,
        category: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const checklist = [
      {
        key: 'materials',
        label: '会前材料',
        ok: true,
        detail:
          uploaded.length > 0
            ? `已上传 ${uploaded.length}/${topic.materials.length}（选填）`
            : topic.materials.length
              ? `尚未上传（选填，不阻断提交）`
              : '无材料清单',
      },
      {
        key: 'precheck',
        label: '党委会前置',
        ok:
          topic.meetingType !== MeetingType.JOINT_CONFERENCE ||
          !topic.needPartyPrecheck ||
          Boolean(topic.relatedPartyResolutionId || topic.transferFrom),
        detail:
          topic.meetingType !== MeetingType.JOINT_CONFERENCE
            ? '党委会议题不适用'
            : !topic.needPartyPrecheck
              ? '未要求前置'
              : topic.relatedPartyResolutionId || topic.transferFrom
                ? '已关联党委决议/转办来源'
                : '已勾选前置但未关联党委决议',
      },
      {
        key: 'temp',
        label: '临时动议说明',
        ok:
          !topic.isTempMotion ||
          topic.materials.some(
            (m) => m.requiredKey === 'temp_motion_note' && m.uploaded,
          ),
        detail: topic.isTempMotion
          ? topic.materials.some(
              (m) => m.requiredKey === 'temp_motion_note' && m.uploaded,
            )
            ? '已上传动议说明'
            : '临时动议但未见动议说明材料'
          : '非临时动议',
      },
      {
        key: 'emergency',
        label: '紧急临机说明',
        ok:
          !topic.isEmergency ||
          topic.materials.some(
            (m) => m.requiredKey === 'emergency_note' && m.uploaded,
          ),
        detail: topic.isEmergency
          ? topic.materials.some(
              (m) => m.requiredKey === 'emergency_note' && m.uploaded,
            )
            ? '已上传紧急说明'
            : '紧急临机但未见说明材料'
          : '非紧急临机',
      },
    ];

    const focusPoints = [
      ...checklist.filter((c) => !c.ok).map((c) => `关注：${c.label} — ${c.detail}`),
      topic.isMajor ? '本议题标记为重大事项，开会法定人数与表决门槛更高。' : null,
      topic.avoidUserIds && topic.avoidUserIds !== '[]'
        ? '已配置回避名单，审题时请确认回避人员是否完整。'
        : '如涉及本人或亲属利益，请督促完善回避名单。',
      similar.length
        ? `本院近有 ${similar.length} 条同类/相近议题可参考历史决议。`
        : '暂无高度相似的本院历史议题。',
    ].filter(Boolean) as string[];

    const briefLines = [
      `议题：${topic.title}`,
      `类型：${topic.meetingType === MeetingType.PARTY_COMMITTEE ? '党委会' : '联席会'} · 分类：${topic.category?.name || '未分类'}`,
      `提案人：${topic.proposer?.realName || '—'}`,
      `状态：${topic.status}`,
      '',
      '一、齐备性检查',
      ...checklist.map((c) => `- [${c.ok ? '通过' : '待补'}] ${c.label}：${c.detail}`),
      '',
      '二、审题关注点',
      ...focusPoints.map((x) => `- ${x}`),
      '',
      '三、同类历史（摘要）',
      similar.length
        ? similar
            .map(
              (s) =>
                `- ${s.title}（${s.category?.name || '未分类'}）${
                  s.resolution
                    ? ` → 决议 ${s.resolution.resultType}`
                    : ' → 尚无决议'
                }`,
            )
            .join('\n')
        : '- 无',
      '',
      '声明：本简报为 AI/规则辅读，不构成同意或退回意见；审签按钮须人工操作。',
    ];

    let outputText = briefLines.join('\n');
    if (this.llm.isConfigured()) {
      try {
        const result = await this.llm.chat(
          '你是高校双会议审题辅读助手。根据给定检查结果，用中文整理一页「审题简报」，分节：概况、齐备性、关注点、历史参考、声明。禁止输出「建议同意/建议否决」。',
          outputText,
          { demoKind: 'material_summary' },
        );
        if (!result.demo) outputText = result.text;
      } catch {
        /* 保留规则简报 */
      }
    }

    const meta = {
      checklist,
      focusPoints,
      similar: similar.map((s) => ({
        id: s.id,
        title: s.title,
        resolutionType: s.resolution?.resultType || null,
      })),
      uploadedCount: uploaded.length,
      missingRequired: [] as string[],
      demo: !this.llm.isConfigured(),
    };

    const row = await this.prisma.aiGeneration.create({
      data: {
        collegeId: topic.collegeId,
        topicId: topic.id,
        userId: user.sub,
        kind: KIND_BRIEF,
        provider: this.llm.isConfigured() ? 'openai_compatible' : 'demo',
        model: this.llm.isConfigured()
          ? this.llm.status().model
          : 'rules-heuristic',
        promptVersion: PROMPT_VERSION_BRIEF,
        inputDigest: topic.title.slice(0, 200),
        outputText,
        metaJson: JSON.stringify(meta),
      },
    });

    await this.audit.log({
      user,
      action: 'AI_REVIEW_BRIEF',
      resource: 'Topic',
      resourceId: topic.id,
      detail: { generationId: row.id, missing: meta.missingRequired },
    });

    return {
      ...this.toView(row),
      checklist,
      focusPoints,
      similar: meta.similar,
      demo: meta.demo,
    };
  }

  async getLatestReviewBrief(user: AuthUser, topicId: string) {
    await this.assertTopicAccess(user, topicId);
    const latest = await this.prisma.aiGeneration.findFirst({
      where: { topicId, kind: KIND_BRIEF },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return { topicId, brief: null };
    const view = this.toView(latest);
    const meta = (view.meta || {}) as Record<string, unknown>;
    return {
      topicId,
      brief: {
        ...view,
        checklist: meta.checklist || [],
        focusPoints: meta.focusPoints || [],
        similar: meta.similar || [],
      },
    };
  }

  private async assertMeetingAccess(user: AuthUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) throw new NotFoundException('会议不存在');
    if (!user.isSchoolAdmin && meeting.collegeId !== user.collegeId) {
      throw new ForbiddenException('无权查看');
    }
    return meeting;
  }

  private async assertTopicAccess(user: AuthUser, topicId: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw new NotFoundException('议题不存在');
    if (!user.isSchoolAdmin && topic.collegeId !== user.collegeId) {
      throw new ForbiddenException('无权查看');
    }
    return topic;
  }

  private extractMaterialText(
    relativePath: string,
    originalName?: string | null,
  ): { text: string; note?: string } {
    try {
      const abs = this.files.absolutePath(relativePath);
      if (!existsSync(abs)) {
        return { text: '', note: '文件不存在' };
      }
      const ext = this.files.getExt(originalName || relativePath);
      if (ext === '.txt' || ext === '.md' || ext === '.csv') {
        const raw = readFileSync(abs, 'utf8');
        return { text: raw };
      }
      // 演示阶段：二进制办公文档不做完整解析，避免引入重型依赖
      if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) {
        const buf = readFileSync(abs);
        const ascii = buf
          .toString('utf8')
          .replace(/[^\x09\x0A\x0D\x20-\x7E\u4e00-\u9fff]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (ascii.length > 80) {
          return {
            text: ascii.slice(0, MAX_CHARS_PER_FILE),
            note: `${ext} 粗提取文本，完整解析需后续 OCR/文档解析`,
          };
        }
        return {
          text: `（文件 ${originalName || relativePath} 为 ${ext}，当前演示未完整解析正文。可另传同名 .txt 说明，或配置大模型后扩展解析。）`,
          note: '二进制材料未完整解析',
        };
      }
      return {
        text: `（暂不支持从 ${ext || '未知类型'} 提取文本）`,
        note: '不支持的类型',
      };
    } catch {
      return { text: '', note: '读取失败' };
    }
  }

  private toView(row: {
    id: string;
    topicId: string | null;
    meetingId?: string | null;
    kind: string;
    provider: string;
    model: string | null;
    promptVersion: string;
    outputText: string;
    metaJson: string | null;
    createdAt: Date;
    userId: string | null;
  }) {
    let meta: Record<string, unknown> | null = null;
    try {
      meta = row.metaJson ? JSON.parse(row.metaJson) : null;
    } catch {
      meta = null;
    }
    return {
      id: row.id,
      topicId: row.topicId,
      meetingId: row.meetingId ?? null,
      kind: row.kind,
      provider: row.provider,
      model: row.model,
      promptVersion: row.promptVersion,
      outputText: row.outputText,
      meta,
      demo: Boolean(meta && (meta as any).demo),
      createdAt: row.createdAt,
      userId: row.userId,
    };
  }
}
