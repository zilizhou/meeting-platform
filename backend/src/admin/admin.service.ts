import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { MeetingType, RoleCode, SupervisionStatus } from '../common/constants';
import {
  assertCollegeVisible,
  assertSchoolWideAccess,
  getVisibleCollegeIds,
  isSchoolAdminRole,
  prismaCollegeIdFilter,
} from '../common/roles';
import {
  currentPeriodRange,
  type FrequencyPeriod,
} from '../common/academic-term';
import { UpsertFrequencyRulesDto } from './dto/frequency-rule.dto';
import { SupervisionsService } from '../supervisions/supervisions.service';
import { LlmProvider } from '../ai/llm.provider';
import { NotificationsService } from '../notifications/notifications.service';

const SCHOOL_BRIEF_KIND = 'SCHOOL_BRIEF';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supervisions: SupervisionsService,
    private readonly llm: LlmProvider,
    private readonly notifications: NotificationsService,
  ) {}

  assertSchoolAdmin(user: AuthUser) {
    assertSchoolWideAccess(user, '仅校级管理员或校级查阅可访问监管看板');
  }

  /** 可见学院 where（College.id） */
  private collegeEntityWhere(user: AuthUser) {
    const v = getVisibleCollegeIds(user);
    if (v === 'ALL') return {};
    if (v.length === 0) return { id: '__none__' };
    if (v.length === 1) return { id: v[0] };
    return { id: { in: v } };
  }

  /** 请求指定学院时校验可见性，否则用分管范围 */
  private meetingCollegeWhere(user: AuthUser, collegeId?: string) {
    if (collegeId) {
      assertCollegeVisible(user, collegeId);
      return { collegeId };
    }
    return prismaCollegeIdFilter(user);
  }

  private periodMeetingWhere(
    collegeId: string | undefined,
    meetingType: string,
    start: Date,
    end: Date,
  ) {
    return {
      ...(collegeId ? { collegeId } : {}),
      meetingType,
      OR: [
        { scheduledAt: { gte: start, lt: end } },
        {
          scheduledAt: null,
          createdAt: { gte: start, lt: end },
        },
      ],
    };
  }

  private async loadFrequencyRules() {
    return this.prisma.meetingFrequencyRule.findMany();
  }

  private resolveFrequencyRule(
    rows: Array<{
      collegeId: string;
      meetingType: string;
      period: string;
      requiredCount: number;
    }>,
    collegeId: string,
    meetingType: string,
  ) {
    return (
      rows.find(
        (r) => r.collegeId === collegeId && r.meetingType === meetingType,
      ) ||
      rows.find((r) => r.collegeId === '' && r.meetingType === meetingType) || {
        collegeId: '',
        meetingType,
        period: 'SEMESTER',
        requiredCount: 1,
      }
    );
  }

  /** 全校/分管范围按学期或规定频次统计两会召开 */
  private async computePeriodHolding(user: AuthUser) {
    const rules = await this.loadFrequencyRules();
    const defaultParty = this.resolveFrequencyRule(
      rules,
      '',
      MeetingType.PARTY_COMMITTEE,
    );
    const defaultJoint = this.resolveFrequencyRule(
      rules,
      '',
      MeetingType.JOINT_CONFERENCE,
    );
    const display = currentPeriodRange(defaultParty.period as FrequencyPeriod);
    const collegeWhere = this.collegeEntityWhere(user);
    const colleges = await this.prisma.college.findMany({
      where: collegeWhere,
      select: { id: true, name: true, code: true },
      orderBy: { code: 'asc' },
    });

    const byCollege: Array<{
      collegeId: string;
      name: string;
      code: string;
      partyCount: number;
      jointCount: number;
      partyRequired: number;
      jointRequired: number;
      partyPeriod: string;
      jointPeriod: string;
      partyHeld: boolean;
      jointHeld: boolean;
      bothOk: boolean;
    }> = [];
    for (const c of colleges) {
      const partyRule = this.resolveFrequencyRule(
        rules,
        c.id,
        MeetingType.PARTY_COMMITTEE,
      );
      const jointRule = this.resolveFrequencyRule(
        rules,
        c.id,
        MeetingType.JOINT_CONFERENCE,
      );
      const partyRange = currentPeriodRange(partyRule.period as FrequencyPeriod);
      const jointRange = currentPeriodRange(jointRule.period as FrequencyPeriod);
      const [partyCount, jointCount] = await Promise.all([
        this.prisma.meeting.count({
          where: this.periodMeetingWhere(
            c.id,
            MeetingType.PARTY_COMMITTEE,
            partyRange.start,
            partyRange.end,
          ),
        }),
        this.prisma.meeting.count({
          where: this.periodMeetingWhere(
            c.id,
            MeetingType.JOINT_CONFERENCE,
            jointRange.start,
            jointRange.end,
          ),
        }),
      ]);
      const partyHeld = partyCount >= partyRule.requiredCount;
      const jointHeld = jointCount >= jointRule.requiredCount;
      byCollege.push({
        collegeId: c.id,
        name: c.name,
        code: c.code,
        partyCount,
        jointCount,
        partyRequired: partyRule.requiredCount,
        jointRequired: jointRule.requiredCount,
        partyPeriod: partyRule.period,
        jointPeriod: jointRule.period,
        partyHeld,
        jointHeld,
        bothOk: partyHeld && jointHeld,
      });
    }

    const missingParty = byCollege.filter((c) => !c.partyHeld);
    const missingJoint = byCollege.filter((c) => !c.jointHeld);

    return {
      year: display.year,
      month: display.month,
      label: display.label,
      start: display.start.toISOString(),
      end: display.end.toISOString(),
      period: defaultParty.period,
      requiredParty: defaultParty.requiredCount,
      requiredJoint: defaultJoint.requiredCount,
      collegeCount: colleges.length,
      partyHeldCount: byCollege.filter((c) => c.partyHeld).length,
      jointHeldCount: byCollege.filter((c) => c.jointHeld).length,
      bothOkCount: byCollege.filter((c) => c.bothOk).length,
      missingPartyCount: missingParty.length,
      missingJointCount: missingJoint.length,
      missingParty: missingParty.map((c) => ({
        collegeId: c.collegeId,
        name: c.name,
        code: c.code,
      })),
      missingJoint: missingJoint.map((c) => ({
        collegeId: c.collegeId,
        name: c.name,
        code: c.code,
      })),
      byCollege,
    };
  }

  async listFrequencyRules(user: AuthUser) {
    this.assertSchoolAdmin(user);
    return this.prisma.meetingFrequencyRule.findMany({
      orderBy: [{ collegeId: 'asc' }, { meetingType: 'asc' }],
    });
  }

  async upsertFrequencyRules(user: AuthUser, dto: UpsertFrequencyRulesDto) {
    this.assertSchoolAdmin(user);
    if (!isSchoolAdminRole(user)) {
      throw new ForbiddenException('仅校级管理员可配置召开频次');
    }
    for (const rule of dto.rules) {
      const collegeId = rule.collegeId || '';
      await this.prisma.meetingFrequencyRule.upsert({
        where: {
          collegeId_meetingType: {
            collegeId,
            meetingType: rule.meetingType,
          },
        },
        create: {
          collegeId,
          meetingType: rule.meetingType,
          period: rule.period,
          requiredCount: rule.requiredCount,
        },
        update: {
          period: rule.period,
          requiredCount: rule.requiredCount,
        },
      });
    }
    return this.listFrequencyRules(user);
  }

  async overview(user: AuthUser) {
    this.assertSchoolAdmin(user);
    await this.supervisions.scanOverdue(user, false);

    const scope = prismaCollegeIdFilter(user);
    const supervisionScope = {
      resolution: { topic: scope },
    };

    const [
      collegeCount,
      jointMeetingCount,
      partyMeetingCount,
      partyTopicCount,
      jointTopicCount,
      transferCount,
      supervisionTotal,
      supervisionDone,
      supervisionOverdue,
      complianceTotal,
      complianceFailed,
      recentMeetings,
      month,
    ] = await Promise.all([
      this.prisma.college.count({ where: this.collegeEntityWhere(user) }),
      this.prisma.meeting.count({
        where: { meetingType: MeetingType.JOINT_CONFERENCE, ...scope },
      }),
      this.prisma.meeting.count({
        where: { meetingType: MeetingType.PARTY_COMMITTEE, ...scope },
      }),
      this.prisma.topic.count({
        where: { meetingType: MeetingType.PARTY_COMMITTEE, ...scope },
      }),
      this.prisma.topic.count({
        where: { meetingType: MeetingType.JOINT_CONFERENCE, ...scope },
      }),
      this.prisma.transferLink.count({
        where: { sourceTopic: scope },
      }),
      this.prisma.supervisionTask.count({ where: supervisionScope }),
      this.prisma.supervisionTask.count({
        where: { status: SupervisionStatus.DONE, ...supervisionScope },
      }),
      this.prisma.supervisionTask.count({
        where: {
          ...supervisionScope,
          OR: [
            { status: SupervisionStatus.OVERDUE },
            {
              status: { not: SupervisionStatus.DONE },
              dueAt: { lt: new Date() },
            },
          ],
        },
      }),
      this.prisma.complianceLog.count({ where: scope }),
      this.prisma.complianceLog.count({ where: { passed: false, ...scope } }),
      this.prisma.meeting.findMany({
        where: scope,
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          college: { select: { name: true, code: true } },
          _count: { select: { topics: true } },
        },
      }),
      this.computePeriodHolding(user),
    ]);

    return {
      collegeCount,
      jointMeetingCount,
      partyMeetingCount,
      partyTopicCount,
      jointTopicCount,
      transferCount,
      supervisionTotal,
      supervisionDone,
      supervisionOverdue,
      supervisionDoneRate:
        supervisionTotal === 0
          ? 1
          : Number((supervisionDone / supervisionTotal).toFixed(3)),
      complianceTotal,
      complianceFailed,
      compliancePassRate:
        complianceTotal === 0
          ? 1
          : Number(((complianceTotal - complianceFailed) / complianceTotal).toFixed(3)),
      recentMeetings,
      month,
    };
  }

  async collegeStats(user: AuthUser) {
    this.assertSchoolAdmin(user);
    const holding = await this.computePeriodHolding(user);
    const colleges = await this.prisma.college.findMany({
      where: this.collegeEntityWhere(user),
      orderBy: { code: 'asc' },
    });

    const rows = [];
    for (const c of colleges) {
      const [
        meetingCount,
        jointTopics,
        partyTopics,
        transfers,
        supervisions,
        done,
        failLogs,
        totalLogs,
        quorumFailMeetings,
      ] = await Promise.all([
        this.prisma.meeting.count({ where: { collegeId: c.id } }),
        this.prisma.topic.count({
          where: { collegeId: c.id, meetingType: MeetingType.JOINT_CONFERENCE },
        }),
        this.prisma.topic.count({
          where: { collegeId: c.id, meetingType: MeetingType.PARTY_COMMITTEE },
        }),
        this.prisma.transferLink.count({
          where: { sourceTopic: { collegeId: c.id } },
        }),
        this.prisma.supervisionTask.count({
          where: { resolution: { topic: { collegeId: c.id } } },
        }),
        this.prisma.supervisionTask.count({
          where: {
            status: SupervisionStatus.DONE,
            resolution: { topic: { collegeId: c.id } },
          },
        }),
        this.prisma.complianceLog.count({
          where: { collegeId: c.id, passed: false },
        }),
        this.prisma.complianceLog.count({ where: { collegeId: c.id } }),
        this.prisma.meeting.count({
          where: {
            collegeId: c.id,
            status: { in: ['RESOLVED', 'IN_PROGRESS', 'SCHEDULED'] },
            canResolve: false,
            actualAttend: { gt: 0 },
          },
        }),
      ]);

      // 双审完成率：联席会议题中已 APPROVED/ON_AGENDA/RESOLVED 等相对已提交审题的比例
      const pendingReview = await this.prisma.topic.count({
        where: {
          collegeId: c.id,
          meetingType: MeetingType.JOINT_CONFERENCE,
          status: 'PENDING_REVIEW',
        },
      });
      const dualPassed = await this.prisma.topic.count({
        where: {
          collegeId: c.id,
          meetingType: MeetingType.JOINT_CONFERENCE,
          status: { in: ['APPROVED', 'ON_AGENDA', 'RESOLVED', 'DISCUSSED', 'REJECTED'] },
        },
      });
      const dualTotal = pendingReview + dualPassed;

      const hold = holding.byCollege.find((row) => row.collegeId === c.id);
      const monthPartyCount = hold?.partyCount ?? 0;
      const monthJointCount = hold?.jointCount ?? 0;

      rows.push({
        collegeId: c.id,
        code: c.code,
        name: c.name,
        meetingCount,
        jointTopics,
        partyTopics,
        transfers,
        supervisions,
        supervisionDoneRate:
          supervisions === 0 ? 1 : Number((done / supervisions).toFixed(3)),
        complianceFailCount: failLogs,
        compliancePassRate:
          totalLogs === 0
            ? 1
            : Number(((totalLogs - failLogs) / totalLogs).toFixed(3)),
        dualReviewRate:
          dualTotal === 0 ? 1 : Number((dualPassed / dualTotal).toFixed(3)),
        quorumRiskCount: quorumFailMeetings,
        monthLabel: holding.label,
        monthPartyCount,
        monthJointCount,
        monthPartyHeld: hold?.partyHeld ?? false,
        monthJointHeld: hold?.jointHeld ?? false,
        monthBothOk: hold?.bothOk ?? false,
      });
    }
    return rows;
  }

  async meetingLedger(
    user: AuthUser,
    query?: {
      collegeId?: string;
      meetingType?: string;
      q?: string;
      from?: string;
      to?: string;
    },
  ) {
    this.assertSchoolAdmin(user);
    const from = this.parseDay(query?.from);
    const to = this.parseDay(query?.to, true);
    const kw = query?.q?.trim();
    const items = await this.prisma.meeting.findMany({
      where: {
        ...this.meetingCollegeWhere(user, query?.collegeId),
        ...(query?.meetingType ? { meetingType: query.meetingType } : {}),
        ...this.meetingDateWhere(from, to),
        ...(kw
          ? {
              OR: [
                { title: { contains: kw } },
                { college: { name: { contains: kw } } },
              ],
            }
          : {}),
      },
      include: {
        college: { select: { id: true, code: true, name: true } },
        topics: {
          select: {
            id: true,
            title: true,
            status: true,
            needPartyPrecheck: true,
            relatedPartyResolutionId: true,
            resolution: { select: { resultType: true } },
          },
        },
        minutes: { select: { effectiveAt: true, signs: true } },
      },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return {
      summary: {
        total: items.length,
        party: items.filter((m) => m.meetingType === MeetingType.PARTY_COMMITTEE)
          .length,
        joint: items.filter((m) => m.meetingType === MeetingType.JOINT_CONFERENCE)
          .length,
      },
      items,
    };
  }

  private parseDay(value?: string, end = false) {
    if (!value) return undefined;
    const raw = value.includes('T') ? value : `${value}T${end ? '23:59:59' : '00:00:00'}`;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  }

  private monthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private monthRange(from: Date, to: Date) {
    const keys: string[] = [];
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const last = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= last) {
      keys.push(this.monthKey(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return keys;
  }

  private meetingDateWhere(from?: Date, to?: Date) {
    if (!from && !to) return {};
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = from;
    if (to) range.lte = to;
    return {
      OR: [
        { scheduledAt: range },
        { scheduledAt: null, createdAt: range },
      ],
    };
  }

  /** 校级统计看板：部门、议题、会议及按月趋势 */
  async dashboardStats(
    user: AuthUser,
    query?: { from?: string; to?: string; collegeId?: string },
  ) {
    this.assertSchoolAdmin(user);
    const from = this.parseDay(query?.from);
    const to = this.parseDay(query?.to, true);
    const collegeWhere = this.meetingCollegeWhere(user, query?.collegeId);
    const topicDate = from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {};
    const meetingDate = this.meetingDateWhere(from, to);

    const [colleges, topics, meetings, holding] = await Promise.all([
      this.prisma.college.findMany({
        where: this.collegeEntityWhere(user),
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.topic.findMany({
        where: { ...collegeWhere, ...topicDate },
        select: {
          collegeId: true,
          meetingType: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.meeting.findMany({
        where: { ...collegeWhere, ...meetingDate },
        select: {
          collegeId: true,
          meetingType: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
        },
      }),
      this.computePeriodHolding(user),
    ]);

    const topicByStatus: Record<string, number> = {};
    let partyTopics = 0;
    let jointTopics = 0;
    for (const t of topics) {
      topicByStatus[t.status] = (topicByStatus[t.status] || 0) + 1;
      if (t.meetingType === MeetingType.PARTY_COMMITTEE) partyTopics += 1;
      else jointTopics += 1;
    }

    const meetingByStatus: Record<string, number> = {};
    let partyMeetings = 0;
    let jointMeetings = 0;
    for (const m of meetings) {
      meetingByStatus[m.status] = (meetingByStatus[m.status] || 0) + 1;
      if (m.meetingType === MeetingType.PARTY_COMMITTEE) partyMeetings += 1;
      else jointMeetings += 1;
    }

    const byCollege = colleges.map((c) => {
      const ct = topics.filter((t) => t.collegeId === c.id);
      const cm = meetings.filter((m) => m.collegeId === c.id);
      return {
        collegeId: c.id,
        code: c.code,
        name: c.name,
        topicCount: ct.length,
        partyTopics: ct.filter((t) => t.meetingType === MeetingType.PARTY_COMMITTEE)
          .length,
        jointTopics: ct.filter((t) => t.meetingType === MeetingType.JOINT_CONFERENCE)
          .length,
        meetingCount: cm.length,
        partyMeetings: cm.filter((m) => m.meetingType === MeetingType.PARTY_COMMITTEE)
          .length,
        jointMeetings: cm.filter(
          (m) => m.meetingType === MeetingType.JOINT_CONFERENCE,
        ).length,
      };
    });

    const seriesFrom =
      from ||
      new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
    const seriesTo = to || new Date();
    const keys = this.monthRange(seriesFrom, seriesTo);
    const monthly = keys.map((key) => {
      const tIn = topics.filter((t) => this.monthKey(t.createdAt) === key);
      const mIn = meetings.filter((m) =>
        this.monthKey(m.scheduledAt || m.createdAt) === key,
      );
      return {
        month: key,
        partyTopics: tIn.filter((t) => t.meetingType === MeetingType.PARTY_COMMITTEE)
          .length,
        jointTopics: tIn.filter((t) => t.meetingType === MeetingType.JOINT_CONFERENCE)
          .length,
        partyMeetings: mIn.filter(
          (m) => m.meetingType === MeetingType.PARTY_COMMITTEE,
        ).length,
        jointMeetings: mIn.filter(
          (m) => m.meetingType === MeetingType.JOINT_CONFERENCE,
        ).length,
      };
    });

    return {
      range: {
        from: (from || seriesFrom).toISOString(),
        to: (to || seriesTo).toISOString(),
      },
      holding,
      colleges: { count: colleges.length, items: byCollege },
      topics: {
        total: topics.length,
        party: partyTopics,
        joint: jointTopics,
        byStatus: topicByStatus,
      },
      meetings: {
        total: meetings.length,
        party: partyMeetings,
        joint: jointMeetings,
        byStatus: meetingByStatus,
      },
      monthly,
    };
  }

  async searchTopics(
    user: AuthUser,
    query?: {
      q?: string;
      collegeId?: string;
      meetingType?: string;
      status?: string;
      from?: string;
      to?: string;
    },
  ) {
    this.assertSchoolAdmin(user);
    const from = this.parseDay(query?.from);
    const to = this.parseDay(query?.to, true);
    const kw = query?.q?.trim();
    const items = await this.prisma.topic.findMany({
      where: {
        ...this.meetingCollegeWhere(user, query?.collegeId),
        ...(query?.meetingType ? { meetingType: query.meetingType } : {}),
        ...(query?.status ? { status: query.status } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
        ...(kw
          ? {
              OR: [
                { title: { contains: kw } },
                { content: { contains: kw } },
                { college: { name: { contains: kw } } },
                { proposer: { realName: { contains: kw } } },
              ],
            }
          : {}),
      },
      include: {
        college: { select: { id: true, code: true, name: true } },
        proposer: { select: { id: true, realName: true } },
        category: { select: { id: true, name: true, code: true } },
        meeting: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      summary: {
        total: items.length,
        party: items.filter((t) => t.meetingType === MeetingType.PARTY_COMMITTEE)
          .length,
        joint: items.filter((t) => t.meetingType === MeetingType.JOINT_CONFERENCE)
          .length,
      },
      items,
    };
  }

  async warnings(user: AuthUser) {
    this.assertSchoolAdmin(user);
    await this.supervisions.scanOverdue(user, false);
    const scope = prismaCollegeIdFilter(user);

    const [failedLogs, overdueTasks, unsignedMinutes, precheckMissing] =
      await Promise.all([
        this.prisma.complianceLog.findMany({
          where: { passed: false, ...scope },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.supervisionTask.findMany({
          where: {
            resolution: { topic: scope },
            OR: [
              { status: SupervisionStatus.OVERDUE },
              {
                status: { notIn: [SupervisionStatus.DONE] },
                dueAt: { lt: new Date() },
              },
            ],
          },
          include: {
            owner: { select: { realName: true } },
            resolution: {
              include: {
                topic: {
                  select: {
                    id: true,
                    title: true,
                    collegeId: true,
                    college: { select: { name: true } },
                  },
                },
              },
            },
          },
          take: 50,
        }),
        this.prisma.minutes.findMany({
          where: {
            effectiveAt: null,
            meeting: scope,
          },
          include: {
            meeting: {
              select: {
                id: true,
                title: true,
                collegeId: true,
                meetingType: true,
                college: { select: { name: true } },
              },
            },
            signs: true,
          },
          take: 50,
        }),
        this.prisma.topic.findMany({
          where: {
            ...scope,
            meetingType: MeetingType.JOINT_CONFERENCE,
            needPartyPrecheck: true,
            relatedPartyResolutionId: null,
            status: { not: 'DRAFT' },
          },
          include: { college: { select: { name: true } } },
          take: 50,
        }),
      ]);

    const pack = {
      complianceFails: failedLogs.map((l) => ({
        type: 'COMPLIANCE_FAIL',
        level: 'high',
        title: l.ruleCode,
        message: l.message,
        collegeId: l.collegeId,
        topicId: l.topicId,
        meetingId: l.meetingId,
        link: l.topicId
          ? `/topics/${l.topicId}`
          : l.meetingId
            ? `/meetings/${l.meetingId}`
            : undefined,
        at: l.createdAt,
      })),
      overdueSupervisions: overdueTasks.map((t) => ({
        type: 'SUPERVISION_OVERDUE',
        level: 'medium',
        title: t.title,
        message: `责任人 ${t.owner.realName}，所属 ${t.resolution.topic.college?.name || ''}`,
        collegeId: t.resolution.topic.collegeId,
        topicId: t.resolution.topic.id,
        link: '/supervisions',
        at: t.dueAt,
      })),
      unsignedMinutes: unsignedMinutes.map((m) => ({
        type: 'MINUTES_UNSIGNED',
        level: 'medium',
        title: m.meeting.title,
        message: `已签 ${m.signs.map((s) => s.side).join('、') || '无人'}，尚未双签生效`,
        collegeId: m.meeting.collegeId,
        meetingId: m.meeting.id,
        meetingType: m.meeting.meetingType,
        link:
          m.meeting.meetingType === 'PARTY_COMMITTEE'
            ? `/meetings/${m.meeting.id}?from=party`
            : `/meetings/${m.meeting.id}`,
        at: m.createdAt,
      })),
      precheckMissing: precheckMissing.map((t) => ({
        type: 'PRECHECK_MISSING',
        level: 'high',
        title: t.title,
        message: `${t.college?.name || ''}：需党组织会议前置但未关联决议`,
        collegeId: t.collegeId,
        topicId: t.id,
        link: `/topics/${t.id}`,
        at: t.updatedAt,
      })),
      monthMissing: [] as Array<Record<string, unknown>>,
    };

    const monthHolding = await this.computePeriodHolding(user);
    pack.monthMissing = [
      ...monthHolding.missingParty.map((c) => ({
        type: 'PERIOD_PARTY_MISSING',
        level: 'high',
        title: `${c.name} · ${monthHolding.label}未按规定召开党组织会议`,
        message: `${monthHolding.label}应召开党组织会议 ${monthHolding.requiredParty} 次，当前未见足够排期/召开记录`,
        collegeId: c.collegeId,
        at: new Date().toISOString(),
      })),
      ...monthHolding.missingJoint.map((c) => ({
        type: 'PERIOD_JOINT_MISSING',
        level: 'high',
        title: `${c.name} · ${monthHolding.label}未按规定召开联席会议`,
        message: `${monthHolding.label}应召开党政联席会议 ${monthHolding.requiredJoint} 次，当前未见足够排期/召开记录`,
        collegeId: c.collegeId,
        at: new Date().toISOString(),
      })),
    ];
    return pack;
  }

  async transfers(user: AuthUser, collegeId?: string) {
    this.assertSchoolAdmin(user);
    if (collegeId) assertCollegeVisible(user, collegeId);
    const scope = prismaCollegeIdFilter(user);
    const links = await this.prisma.transferLink.findMany({
      where: collegeId
        ? { sourceTopic: { collegeId } }
        : { sourceTopic: scope },
      include: {
        sourceTopic: {
          select: {
            id: true,
            title: true,
            status: true,
            collegeId: true,
            college: { select: { name: true, code: true } },
            resolution: { select: { id: true, resultType: true } },
          },
        },
        targetTopic: {
          select: {
            id: true,
            title: true,
            status: true,
            needPartyPrecheck: true,
            relatedPartyResolutionId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return links;
  }

  /** 组装巡视材料包所需结构化数据（供 ZIP 写入） */
  async buildInspectionPackData(user: AuthUser, collegeId?: string) {
    this.assertSchoolAdmin(user);
    if (collegeId) assertCollegeVisible(user, collegeId);
    const scope = this.meetingCollegeWhere(user, collegeId);
    const [overview, colleges, meetings, transfers, warnings, supervisions, complianceLogs] =
      await Promise.all([
        this.overview(user),
        this.collegeStats(user),
        this.meetingLedger(user, { collegeId }),
        this.transfers(user, collegeId),
        this.warnings(user),
        this.prisma.supervisionTask.findMany({
          where: { resolution: { topic: scope } },
          include: {
            owner: { select: { realName: true, username: true } },
            resolution: {
              include: {
                topic: {
                  select: {
                    title: true,
                    college: { select: { name: true, code: true } },
                  },
                },
              },
            },
            feedbacks: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        this.prisma.complianceLog.findMany({
          where: scope,
          orderBy: { createdAt: 'desc' },
          take: 1000,
        }),
      ]);

    // 抽样会议全宗：最近 5 场（或指定学院全部最近 5 场）
    const sampleMeetings = await this.prisma.meeting.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        college: true,
        attendances: {
          include: { user: { select: { realName: true, title: true } } },
        },
        topics: {
          include: {
            jointReviews: true,
            discussions: true,
            votes: true,
            resolution: { include: { supervisionTasks: true } },
            materials: {
              select: {
                name: true,
                isRequired: true,
                uploaded: true,
                originalName: true,
                filePath: true,
              },
            },
            transferFrom: true,
            transferTo: true,
          },
        },
        minutes: { include: { signs: true } },
      },
    });

    return {
      overview,
      colleges: collegeId
        ? colleges.filter((c) => c.collegeId === collegeId)
        : colleges,
      meetings: meetings.items,
      transfers: collegeId
        ? transfers.filter((t) => t.sourceTopic.collegeId === collegeId)
        : transfers,
      warnings,
      supervisions,
      complianceLogs,
      sampleMeetings,
      exportedAt: new Date().toISOString(),
      scope: collegeId || 'ALL',
    };
  }

  /** 简报范围：单院 / 分管多院 / 全校 */
  private async resolveBriefScope(user: AuthUser, collegeId?: string) {
    if (collegeId) {
      assertCollegeVisible(user, collegeId);
      const c = await this.prisma.college.findUnique({
        where: { id: collegeId },
        select: { id: true, name: true },
      });
      if (!c) throw new NotFoundException('学院不存在');
      return {
        scopeKey: `COLLEGE:${c.id}`,
        collegeId: c.id,
        collegeIds: [c.id] as string[],
        titlePrefix: c.name,
        narrativeUnit: `学院「${c.name}」`,
        rateLabel: '该院',
        isSingleCollege: true,
      };
    }
    const visible = getVisibleCollegeIds(user);
    if (visible === 'ALL') {
      return {
        scopeKey: 'ALL',
        collegeId: null as string | null,
        collegeIds: null as string[] | null,
        titlePrefix: '全校二级学院',
        narrativeUnit: '全校纳入监测二级学院',
        rateLabel: '全校',
        isSingleCollege: false,
      };
    }
    const colleges = await this.prisma.college.findMany({
      where: { id: { in: visible } },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    });
    const names = colleges.map((c) => c.name);
    return {
      scopeKey: `SCOPE:${[...visible].sort().join(',')}`,
      collegeId: null as string | null,
      collegeIds: visible,
      titlePrefix: '分管学院',
      narrativeUnit: `分管范围内二级学院（${names.join('、') || '无'}）`,
      rateLabel: '分管范围',
      isSingleCollege: false,
    };
  }

  private briefingTitle(
    mode: 'monthly' | 'realtime',
    titlePrefix: string,
    monthLabel: string,
  ) {
    return mode === 'realtime'
      ? `${titlePrefix}双会实时快报（${monthLabel}）`
      : `${titlePrefix}双会月度情况汇报（${monthLabel}）`;
  }

  private parseBriefMeta(metaJson: string | null): Record<string, unknown> {
    try {
      return metaJson ? JSON.parse(metaJson) : {};
    } catch {
      return {};
    }
  }

  /** 当前用户是否可见该简报（按分管 / 学院筛选） */
  private isBriefingVisibleToUser(
    user: AuthUser,
    meta: Record<string, unknown>,
    filterCollegeId?: string,
  ) {
    const scopeKey = String(meta.scopeKey || 'ALL');
    const metaCollegeId =
      typeof meta.collegeId === 'string' ? meta.collegeId : null;
    const metaCollegeIds = Array.isArray(meta.collegeIds)
      ? (meta.collegeIds as string[])
      : metaCollegeId
        ? [metaCollegeId]
        : null;

    if (filterCollegeId) {
      // 筛单院时只展示「该院」简报，不含全校/分管汇总
      return metaCollegeId === filterCollegeId;
    }

    const visible = getVisibleCollegeIds(user);
    if (visible === 'ALL') {
      // 管理员默认列表：看全校简报 + 自己生成的分管/单院简报均可
      return true;
    }
    // 分管查阅：不可见「全校」旧简报
    if (scopeKey === 'ALL' || (!meta.scopeKey && !metaCollegeId)) return false;
    if (metaCollegeId) return visible.includes(metaCollegeId);
    if (metaCollegeIds) {
      return metaCollegeIds.every((id) => visible.includes(id));
    }
    return scopeKey === `SCOPE:${[...visible].sort().join(',')}`;
  }

  /**
   * 面向组织部 / 校领导的双会情况汇报。
   * 数字以系统统计为准；AI 仅做文书润色，不得改数。
   * collegeId 有值 → 单院；空 → 全校或当前账号分管范围。
   */
  async generateSchoolBriefing(
    user: AuthUser,
    query?: {
      mode?: 'monthly' | 'realtime';
      notify?: boolean;
      collegeId?: string;
    },
  ) {
    this.assertSchoolAdmin(user);
    const mode = query?.mode === 'realtime' ? 'realtime' : 'monthly';
    const notify = Boolean(query?.notify);
    const scope = await this.resolveBriefScope(
      user,
      query?.collegeId || undefined,
    );

    const [overview, warnings, colleges] = await Promise.all([
      this.overview(user),
      this.warnings(user),
      this.collegeStats(user),
    ]);

    const idSet = scope.collegeIds ? new Set(scope.collegeIds) : null;
    const inScope = (collegeId?: string | null) =>
      !idSet || (!!collegeId && idSet.has(collegeId));

    const collegeRows = colleges.filter((c) => inScope(c.collegeId));
    const month = overview.month;
    const byCollege = (month.byCollege || []).filter((c: any) =>
      inScope(c.collegeId),
    );
    const missingParty = (month.missingParty || []).filter((c: any) =>
      inScope(c.collegeId),
    );
    const missingJoint = (month.missingJoint || []).filter((c: any) =>
      inScope(c.collegeId),
    );
    const partyHeldCount = byCollege.filter((c: any) => c.partyHeld).length;
    const jointHeldCount = byCollege.filter((c: any) => c.jointHeld).length;
    const bothOkCount = byCollege.filter((c: any) => c.bothOk).length;

    const filterWarn = (items: any[]) =>
      (items || []).filter((i) => inScope(i.collegeId));
    const monthMissing = filterWarn(warnings.monthMissing);
    const complianceFails = filterWarn(warnings.complianceFails);
    const overdueSupervisions = filterWarn(warnings.overdueSupervisions);
    const unsignedMinutes = filterWarn(warnings.unsignedMinutes);
    const precheckMissing = filterWarn(warnings.precheckMissing);

    const title = this.briefingTitle(mode, scope.titlePrefix, month.label);
    const facts = {
      mode,
      generatedAt: new Date().toISOString(),
      monthLabel: month.label,
      year: month.year,
      month: month.month,
      scopeKey: scope.scopeKey,
      collegeId: scope.collegeId,
      collegeIds: scope.collegeIds,
      titlePrefix: scope.titlePrefix,
      narrativeUnit: scope.narrativeUnit,
      rateLabel: scope.rateLabel,
      title,
      collegeCount: collegeRows.length,
      bothOkCount,
      partyHeldCount,
      jointHeldCount,
      missingPartyCount: missingParty.length,
      missingJointCount: missingJoint.length,
      missingParty,
      missingJoint,
      warningCounts: {
        monthMissing: monthMissing.length,
        complianceFails: complianceFails.length,
        overdueSupervisions: overdueSupervisions.length,
        unsignedMinutes: unsignedMinutes.length,
        precheckMissing: precheckMissing.length,
      },
      supervisionOverdue: overdueSupervisions.length,
      supervisionDoneRate:
        collegeRows.length === 0
          ? overview.supervisionDoneRate
          : Number(
              (
                collegeRows.reduce(
                  (s, c) => s + (c.supervisionDoneRate || 0),
                  0,
                ) / collegeRows.length
              ).toFixed(3),
            ),
      compliancePassRate:
        collegeRows.length === 0
          ? overview.compliancePassRate
          : Number(
              (
                collegeRows.reduce(
                  (s, c) => s + (c.compliancePassRate ?? 1),
                  0,
                ) / collegeRows.length
              ).toFixed(3),
            ),
      colleges: collegeRows.map((c) => ({
        name: c.name,
        monthPartyHeld: c.monthPartyHeld,
        monthJointHeld: c.monthJointHeld,
        monthBothOk: c.monthBothOk,
        dualReviewRate: c.dualReviewRate,
        supervisionDoneRate: c.supervisionDoneRate,
        quorumRiskCount: c.quorumRiskCount,
      })),
    };

    const factText = this.renderSchoolBriefingFacts(facts);
    let outputText = factText;
    let provider = 'template';
    let model: string | null = 'fact-narrative-v1';
    let demo = true;

    if (this.llm.isConfigured()) {
      const polished = await this.llm.chat(
        [
          '你是曲阜师范大学组织部文秘助手，为校领导撰写「二级学院双会进展」情况汇报。',
          '严格要求：',
          '1. 不得篡改、遗漏用户提供的任何数字与学院名单；',
          '2. 不得编造未提供的学院、会议、比例；',
          '3. 文风庄重简洁，适合校领导阅；分「总体研判—重点问题—工作建议」三段；',
          '4. 保留「明德同枢」口径：制度硬校验、全流程留痕、AI 不替代审签；',
          `5. 汇报范围是「${scope.narrativeUnit}」，禁止写成超出该范围的「全校」口径（除非范围本身就是全校）。`,
        ].join('\n'),
        `请将下列事实材料润色为完整汇报正文（不要输出 JSON）：\n\n${factText}`,
        { demoKind: 'material_summary', fallbackOnNetworkError: true },
      );
      if (!polished.demo && polished.text?.trim()) {
        outputText = polished.text.trim();
        provider = polished.provider;
        model = polished.model;
        demo = false;
      }
    }

    const digest = createHash('sha256')
      .update(JSON.stringify(facts))
      .digest('hex')
      .slice(0, 32);

    const row = await this.prisma.aiGeneration.create({
      data: {
        collegeId: scope.collegeId,
        userId: user.sub,
        kind: SCHOOL_BRIEF_KIND,
        provider,
        model,
        promptVersion: 'school-brief-v2',
        inputDigest: digest,
        outputText,
        metaJson: JSON.stringify({
          ...facts,
          demo,
          title,
        }),
      },
    });

    let notified = 0;
    if (notify) {
      notified = await this.notifySchoolAdminsBriefing(
        row.id,
        mode,
        month.label,
        title,
      );
    }

    return {
      id: row.id,
      mode,
      title,
      content: outputText,
      provider,
      model,
      demo,
      facts,
      notified,
      createdAt: row.createdAt,
    };
  }

  async listSchoolBriefings(
    user: AuthUser,
    opts?: { take?: number; collegeId?: string },
  ) {
    this.assertSchoolAdmin(user);
    if (opts?.collegeId) assertCollegeVisible(user, opts.collegeId);
    const take = Math.min(Math.max(opts?.take ?? 20, 1), 50);
    const rows = await this.prisma.aiGeneration.findMany({
      where: { kind: SCHOOL_BRIEF_KIND },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        id: true,
        collegeId: true,
        provider: true,
        model: true,
        metaJson: true,
        createdAt: true,
        outputText: true,
      },
    });
    return rows
      .map((r) => {
        const meta = this.parseBriefMeta(r.metaJson);
        if (r.collegeId && !meta.collegeId) meta.collegeId = r.collegeId;
        return { r, meta };
      })
      .filter(({ meta }) =>
        this.isBriefingVisibleToUser(user, meta, opts?.collegeId),
      )
      .slice(0, take)
      .map(({ r, meta }) => ({
        id: r.id,
        title:
          (meta.title as string) ||
          this.briefingTitle(
            (meta.mode as 'monthly' | 'realtime') || 'monthly',
            (meta.titlePrefix as string) || '全校二级学院',
            (meta.monthLabel as string) || '',
          ),
        mode: (meta.mode as string) || 'monthly',
        monthLabel: (meta.monthLabel as string) || '',
        scopeKey: (meta.scopeKey as string) || 'ALL',
        collegeId: (meta.collegeId as string) || r.collegeId || null,
        provider: r.provider,
        model: r.model,
        demo: Boolean(meta.demo),
        preview: r.outputText.slice(0, 160),
        createdAt: r.createdAt,
      }));
  }

  async getSchoolBriefing(user: AuthUser, id: string) {
    this.assertSchoolAdmin(user);
    const row = await this.prisma.aiGeneration.findUnique({ where: { id } });
    if (!row || row.kind !== SCHOOL_BRIEF_KIND) {
      throw new NotFoundException('简报不存在');
    }
    const meta = this.parseBriefMeta(row.metaJson);
    if (row.collegeId && !meta.collegeId) meta.collegeId = row.collegeId;
    if (!this.isBriefingVisibleToUser(user, meta)) {
      throw new ForbiddenException('无权查阅该简报');
    }
    return {
      id: row.id,
      title:
        (meta.title as string) ||
        this.briefingTitle(
          (meta.mode as 'monthly' | 'realtime') || 'monthly',
          (meta.titlePrefix as string) || '全校二级学院',
          (meta.monthLabel as string) || '',
        ),
      mode: (meta.mode as string) || 'monthly',
      content: row.outputText,
      provider: row.provider,
      model: row.model,
      demo: Boolean(meta.demo),
      facts: meta,
      createdAt: row.createdAt,
    };
  }

  private renderSchoolBriefingFacts(facts: {
    mode: string;
    generatedAt: string;
    monthLabel: string;
    title: string;
    narrativeUnit: string;
    rateLabel: string;
    collegeCount: number;
    bothOkCount: number;
    partyHeldCount: number;
    jointHeldCount: number;
    missingPartyCount: number;
    missingJointCount: number;
    missingParty: Array<{ name: string }>;
    missingJoint: Array<{ name: string }>;
    warningCounts: Record<string, number>;
    supervisionOverdue: number;
    supervisionDoneRate: number;
    compliancePassRate: number;
    colleges: Array<{
      name: string;
      monthPartyHeld: boolean;
      monthJointHeld: boolean;
      monthBothOk: boolean;
    }>;
  }) {
    const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
    const missParty = facts.missingParty.map((c) => c.name).join('、') || '无';
    const missJoint = facts.missingJoint.map((c) => c.name).join('、') || '无';
    const bothOk = facts.colleges
      .filter((c) => c.monthBothOk)
      .map((c) => c.name);
    const lines = [
      `明德同枢｜${facts.title}`,
      `生成时间：${new Date(facts.generatedAt).toLocaleString('zh-CN')}`,
      '',
      '一、总体研判',
      `截至当前，${facts.narrativeUnit}共 ${facts.collegeCount} 所。${facts.monthLabel}党组织会议已开 ${facts.partyHeldCount} 所、党政联席会议已开 ${facts.jointHeldCount} 所，双会齐全 ${facts.bothOkCount} 所。`,
      `双会齐全学院：${bothOk.join('、') || '暂无'}。`,
      `${facts.rateLabel}督办办结率 ${pct(facts.supervisionDoneRate)}，合规通过率 ${pct(facts.compliancePassRate)}，逾期督办 ${facts.supervisionOverdue} 条。`,
      '',
      '二、重点问题',
      `1. ${facts.monthLabel}未按规定召开党组织会议（${facts.missingPartyCount}）：${missParty}。`,
      `2. ${facts.monthLabel}未按规定召开党政联席会议（${facts.missingJointCount}）：${missJoint}。`,
      `3. 预警合计：缺开 ${facts.warningCounts.monthMissing}、合规失败 ${facts.warningCounts.complianceFails}、督办逾期 ${facts.warningCounts.overdueSupervisions}、纪要未双签 ${facts.warningCounts.unsignedMinutes}、前置把关缺失 ${facts.warningCounts.precheckMissing}。`,
      '',
      '三、工作建议',
      '1. 请对照缺开清单，督促相关学院按学期/规定频次完成排期与召开留痕。',
      '2. 对督办逾期、纪要未双签事项开展定向催办，提高闭环率。',
      '3. 继续坚持「制度硬校验、全流程留痕、AI 不替代审签」，保证程序合规与责任清晰。',
      '',
      '（本汇报数字取自明德同枢系统实时统计；AI 仅作文书辅助。）',
    ];
    return lines.join('\n');
  }

  private async notifySchoolAdminsBriefing(
    briefingId: string,
    mode: string,
    monthLabel: string,
    reportTitle: string,
  ) {
    const admins = await this.prisma.user.findMany({
      where: {
        OR: [
          { isSchoolAdmin: true },
          { roles: { some: { role: { code: RoleCode.SCHOOL_ADMIN } } } },
          { roles: { some: { role: { code: RoleCode.SCHOOL_VIEWER } } } },
        ],
      },
      select: { id: true },
    });
    const title =
      mode === 'realtime'
        ? `【实时快报】${reportTitle}`
        : `【月度汇报】${reportTitle}`;
    const res = await this.notifications.notifyMany(
      admins.map((a) => ({
        userId: a.id,
        collegeId: null,
        type: 'SCHOOL_BRIEF',
        title,
        content: '明德同枢已生成校级双会情况汇报，请到「校级监管」查阅。',
        link: `/admin?briefing=${briefingId}`,
      })),
    );
    return res.count;
  }
}

/** CSV 简易序列化 */
export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(',')).join('\n');
  return `\uFEFF${header}\n${body}\n`;
}
