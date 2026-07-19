import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import {
  JointReviewSide,
  MeetingType,
  ReviewDecision,
  RoleCode,
  SupervisionStatus,
  TopicStatus,
} from '../common/constants';

export interface TodoItem {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  meetingType?: string;
  topicId?: string;
  meetingId?: string;
  taskId?: string;
  createdAt?: string;
}

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getTodos(user: AuthUser) {
    const items: TodoItem[] = [];
    const roles = user.roles || [];

    if (roles.includes(RoleCode.SECRETARY) || roles.includes(RoleCode.DEAN)) {
      items.push(...(await this.pendingJointReviews(user)));
    }
    if (roles.includes(RoleCode.SECRETARY)) {
      items.push(...(await this.pendingPartyReviews(user)));
    }
    if (
      roles.includes(RoleCode.SECRETARY) ||
      roles.includes(RoleCode.VICE_SECRETARY) ||
      roles.includes(RoleCode.DEAN)
    ) {
      items.push(...(await this.pendingMinutesSigns(user)));
    }
    items.push(...(await this.pendingSupervisions(user)));
    items.push(...(await this.pendingCheckins(user)));
    items.push(...(await this.pendingMaterialReads(user)));

    items.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });

    const summary = {
      total: items.length,
      jointReview: items.filter((i) => i.type === 'JOINT_REVIEW').length,
      partyReview: items.filter((i) => i.type === 'PARTY_REVIEW').length,
      minutesSign: items.filter((i) => i.type === 'MINUTES_SIGN').length,
      supervision: items.filter((i) => i.type === 'SUPERVISION').length,
      checkin: items.filter((i) => i.type === 'CHECKIN').length,
      materialRead: items.filter((i) => i.type === 'MATERIAL_READ').length,
    };

    return { summary, items };
  }

  /** 双会标准流程 + 本院进行中事项所处环节 */
  async getFlowBoard(user: AuthUser) {
    const collegeFilter =
      user.collegeId && !user.isSchoolAdmin
        ? { collegeId: user.collegeId }
        : {};

    const jointSteps = [
      { key: 'DRAFT', label: '申报材料' },
      { key: 'REVIEW', label: '书记院长双审' },
      { key: 'APPROVED', label: '入会议程' },
      { key: 'MEETING', label: '开会签到表决' },
      { key: 'MINUTES', label: '纪要双签' },
      { key: 'SUPERVISION', label: '督办落实' },
      { key: 'ARCHIVED', label: '归档' },
    ];
    const partySteps = [
      { key: 'DRAFT', label: '申报材料' },
      { key: 'REVIEW', label: '书记审题' },
      { key: 'APPROVED', label: '入会议程' },
      { key: 'MEETING', label: '开会签到表决' },
      { key: 'MINUTES', label: '书记签纪要' },
      { key: 'TRANSFER', label: '转联席/督办' },
      { key: 'ARCHIVED', label: '归档' },
    ];

    const topics = await this.prisma.topic.findMany({
      where: {
        ...collegeFilter,
        status: {
          notIn: [TopicStatus.REJECTED],
        },
      },
      include: {
        jointReviews: true,
        resolution: {
          include: {
            supervisionTasks: {
              select: { id: true, status: true },
            },
          },
        },
        transferTo: true,
        meeting: {
          include: {
            minutes: { select: { effectiveAt: true } },
          },
        },
        college: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    });

    const active = topics
      .map((t) => this.mapTopicFlow(t))
      .filter((x) => x.stageKey !== 'ARCHIVED' && x.stageKey !== 'DONE');

    const jointActive = active.filter(
      (x) => x.meetingType === MeetingType.JOINT_CONFERENCE,
    );
    const partyActive = active.filter(
      (x) => x.meetingType === MeetingType.PARTY_COMMITTEE,
    );

    const countByStage = (list: typeof active, steps: typeof jointSteps) =>
      steps.map((s) => ({
        ...s,
        count: list.filter((i) => i.stageKey === s.key).length,
      }));

    return {
      joint: {
        title: '党政联席会议流程',
        steps: jointSteps,
        stageStats: countByStage(jointActive, jointSteps),
        items: jointActive.slice(0, 12),
      },
      party: {
        title: '学院党组织会议流程',
        steps: partySteps,
        stageStats: countByStage(partyActive, partySteps),
        items: partyActive.slice(0, 12),
      },
    };
  }

  private mapTopicFlow(t: {
    id: string;
    title: string;
    meetingType: string;
    status: string;
    isMajor: boolean;
    isEmergency: boolean;
    isTempMotion: boolean;
    updatedAt: Date;
    college?: { name: string } | null;
    jointReviews: { side: string; decision: string }[];
    resolution: {
      id: string;
      supervisionTasks: { id: string; status: string }[];
    } | null;
    transferTo: { id: string } | null;
    meeting: {
      id: string;
      status: string;
      minutes: { effectiveAt: Date | null } | null;
    } | null;
  }) {
    const isParty = t.meetingType === MeetingType.PARTY_COMMITTEE;
    let stageKey = 'DRAFT';
    let stageLabel = '申报材料';
    let stepIndex = 0;

    if (t.status === TopicStatus.DRAFT) {
      stageKey = 'DRAFT';
      stageLabel = '申报材料';
      stepIndex = 0;
    } else if (
      t.status === TopicStatus.PENDING_REVIEW ||
      t.status === TopicStatus.DEFERRED
    ) {
      stageKey = 'REVIEW';
      stageLabel = isParty
        ? '书记审题'
        : t.status === TopicStatus.DEFERRED
          ? '双审暂缓'
          : '书记院长双审';
      stepIndex = 1;
    } else if (t.status === TopicStatus.APPROVED) {
      stageKey = 'APPROVED';
      stageLabel = '待入会议程';
      stepIndex = 2;
    } else if (
      t.status === TopicStatus.ON_AGENDA ||
      t.status === TopicStatus.DISCUSSED
    ) {
      const mStatus = t.meeting?.status;
      if (mStatus === 'IN_PROGRESS') {
        stageKey = 'MEETING';
        stageLabel = '开会签到表决中';
        stepIndex = 3;
      } else if (mStatus === 'ENDED') {
        stageKey = 'MINUTES';
        stageLabel = '已散会待纪要';
        stepIndex = 4;
      } else if (mStatus === 'RESOLVED' || mStatus === 'ARCHIVED') {
        // fall through via resolution below
        stageKey = 'MEETING';
        stageLabel = '会中已结束待决议';
        stepIndex = 3;
      } else {
        stageKey = 'APPROVED';
        stageLabel = '已入议程待开会';
        stepIndex = 2;
      }
    }

    if (t.status === TopicStatus.RESOLVED || t.resolution) {
      const minutesOk = Boolean(t.meeting?.minutes?.effectiveAt);
      const meetingArchived = t.meeting?.status === 'ARCHIVED';
      const tasks = t.resolution?.supervisionTasks || [];
      const allDone =
        tasks.length > 0 &&
        tasks.every((x) => x.status === SupervisionStatus.DONE);

      if (meetingArchived && (allDone || tasks.length === 0)) {
        stageKey = 'ARCHIVED';
        stageLabel = '已归档';
        stepIndex = isParty ? 6 : 6;
      } else if (!minutesOk) {
        stageKey = 'MINUTES';
        stageLabel = isParty ? '待书记签纪要' : '待纪要双签';
        stepIndex = 4;
      } else if (isParty && !t.transferTo && tasks.length === 0) {
        stageKey = 'TRANSFER';
        stageLabel = '可转联席会 / 待督办';
        stepIndex = 5;
      } else if (tasks.some((x) => x.status !== SupervisionStatus.DONE)) {
        stageKey = isParty ? 'TRANSFER' : 'SUPERVISION';
        stageLabel = '督办落实中';
        stepIndex = 5;
      } else if (meetingArchived) {
        stageKey = 'ARCHIVED';
        stageLabel = '已归档';
        stepIndex = 6;
      } else {
        stageKey = isParty ? 'TRANSFER' : 'SUPERVISION';
        stageLabel = '纪要已生效，待归档';
        stepIndex = 5;
      }
    }

    if (t.status === TopicStatus.REJECTED) {
      stageKey = 'DONE';
      stageLabel = '未通过';
      stepIndex = -1;
    }

    return {
      topicId: t.id,
      meetingId: t.meeting?.id || null,
      title: t.title,
      meetingType: t.meetingType,
      collegeName: t.college?.name || '',
      status: t.status,
      stageKey,
      stageLabel,
      stepIndex,
      isMajor: t.isMajor,
      isEmergency: t.isEmergency,
      isTempMotion: t.isTempMotion,
      updatedAt: t.updatedAt.toISOString(),
      link:
        t.meetingType === MeetingType.PARTY_COMMITTEE
          ? `/topics/${t.id}?from=party`
          : `/topics/${t.id}`,
    };
  }

  private async pendingJointReviews(user: AuthUser): Promise<TodoItem[]> {
    const side = user.roles.includes(RoleCode.SECRETARY)
      ? JointReviewSide.SECRETARY
      : JointReviewSide.DEAN;

    const reviews = await this.prisma.jointReview.findMany({
      where: {
        side,
        decision: ReviewDecision.PENDING,
        topic: {
          meetingType: MeetingType.JOINT_CONFERENCE,
          status: TopicStatus.PENDING_REVIEW,
          ...(user.collegeId && !user.isSchoolAdmin
            ? { collegeId: user.collegeId }
            : {}),
        },
      },
      include: {
        topic: {
          select: {
            id: true,
            title: true,
            meetingType: true,
            createdAt: true,
            college: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map((r) => ({
      id: `joint-review-${r.id}`,
      type: 'JOINT_REVIEW',
      title: `联席会议题待审：${r.topic.title}`,
      subtitle: `${r.topic.college?.name || ''} · ${side === 'SECRETARY' ? '书记审' : '院长审'}`,
      meetingType: r.topic.meetingType,
      topicId: r.topic.id,
      createdAt: r.topic.createdAt.toISOString(),
    }));
  }

  private async pendingPartyReviews(user: AuthUser): Promise<TodoItem[]> {
    const topics = await this.prisma.topic.findMany({
      where: {
        meetingType: MeetingType.PARTY_COMMITTEE,
        status: TopicStatus.PENDING_REVIEW,
        ...(user.collegeId && !user.isSchoolAdmin
          ? { collegeId: user.collegeId }
          : {}),
      },
      include: { college: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return topics.map((t) => ({
      id: `party-review-${t.id}`,
      type: 'PARTY_REVIEW',
      title: `党组织会议议题待审：${t.title}`,
      subtitle: `${t.college?.name || ''} · 书记审题`,
      meetingType: t.meetingType,
      topicId: t.id,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  private async pendingMinutesSigns(user: AuthUser): Promise<TodoItem[]> {
    const isSecretary = user.roles.includes(RoleCode.SECRETARY);
    const isViceSecretary = user.roles.includes(RoleCode.VICE_SECRETARY);
    const isDean = user.roles.includes(RoleCode.DEAN);

    const minutesList = await this.prisma.minutes.findMany({
      where: {
        effectiveAt: null,
        meeting: {
          ...(user.collegeId && !user.isSchoolAdmin
            ? { collegeId: user.collegeId }
            : {}),
        },
      },
      include: {
        signs: true,
        meeting: {
          select: {
            id: true,
            title: true,
            meetingType: true,
            college: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const items: TodoItem[] = [];
    for (const m of minutesList) {
      const hasSecretary = m.signs.some((s) => s.side === JointReviewSide.SECRETARY);
      const hasDean = m.signs.some((s) => s.side === JointReviewSide.DEAN);
      const isParty = m.meeting.meetingType === MeetingType.PARTY_COMMITTEE;

      let needSign = false;
      let sideLabel = '';
      if (isParty) {
        if ((isSecretary || isViceSecretary) && !hasSecretary) {
          needSign = true;
          sideLabel = '书记/副书记签署';
        }
      } else {
        if (isSecretary && !hasSecretary) {
          needSign = true;
          sideLabel = '书记签署';
        } else if (isDean && !hasDean) {
          needSign = true;
          sideLabel = '院长签署';
        }
      }

      if (!needSign) continue;
      items.push({
        id: `minutes-${m.id}-${user.sub}`,
        type: 'MINUTES_SIGN',
        title: `纪要待签：${m.meeting.title}`,
        subtitle: `${m.meeting.college?.name || ''} · ${sideLabel}`,
        meetingType: m.meeting.meetingType,
        meetingId: m.meeting.id,
        createdAt: m.createdAt.toISOString(),
      });
    }
    return items;
  }

  private async pendingSupervisions(user: AuthUser): Promise<TodoItem[]> {
    const tasks = await this.prisma.supervisionTask.findMany({
      where: {
        ownerId: user.sub,
        status: {
          notIn: [SupervisionStatus.DONE],
        },
      },
      include: {
        resolution: {
          include: {
            topic: {
              select: {
                id: true,
                title: true,
                meetingType: true,
                college: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tasks.map((t) => ({
      id: `supervision-${t.id}`,
      type: 'SUPERVISION',
      title: `督办待办：${t.title}`,
      subtitle: `${t.resolution.topic.college?.name || ''} · ${t.status}`,
      meetingType: t.resolution.topic.meetingType,
      topicId: t.resolution.topic.id,
      taskId: t.id,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  private async pendingCheckins(user: AuthUser): Promise<TodoItem[]> {
    const attendances = await this.prisma.attendance.findMany({
      where: {
        userId: user.sub,
        checkedIn: false,
        leaveNote: null,
        meeting: {
          status: { in: ['DRAFT', 'SCHEDULED', 'IN_PROGRESS'] },
        },
      },
      include: {
        meeting: {
          select: {
            id: true,
            title: true,
            meetingType: true,
            status: true,
            createdAt: true,
            college: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return attendances.map((a) => ({
      id: `checkin-${a.id}`,
      type: 'CHECKIN',
      title: `待签到：${a.meeting.title}`,
      subtitle: `${a.meeting.college?.name || ''} · ${a.meeting.status}`,
      meetingType: a.meeting.meetingType,
      meetingId: a.meeting.id,
      createdAt: a.meeting.createdAt.toISOString(),
    }));
  }

  private async pendingMaterialReads(user: AuthUser): Promise<TodoItem[]> {
    if (!user.collegeId && !user.isSchoolAdmin) return [];

    const materials = await this.prisma.material.findMany({
      where: {
        uploaded: true,
        topic: {
          status: {
            in: [
              TopicStatus.APPROVED,
              TopicStatus.ON_AGENDA,
              TopicStatus.PENDING_REVIEW,
            ],
          },
          ...(user.collegeId && !user.isSchoolAdmin
            ? { collegeId: user.collegeId }
            : {}),
        },
        receipts: { none: { userId: user.sub } },
      },
      include: {
        topic: {
          select: {
            id: true,
            title: true,
            meetingType: true,
            createdAt: true,
            college: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    // 按议题聚合，避免材料过多刷屏
    const byTopic = new Map<string, { topic: (typeof materials)[0]['topic']; count: number }>();
    for (const m of materials) {
      const cur = byTopic.get(m.topicId);
      if (cur) cur.count += 1;
      else byTopic.set(m.topicId, { topic: m.topic, count: 1 });
    }

    return [...byTopic.entries()].map(([topicId, v]) => ({
      id: `read-${topicId}`,
      type: 'MATERIAL_READ',
      title: `待阅件：${v.topic.title}`,
      subtitle: `${v.topic.college?.name || ''} · ${v.count} 份材料未回执`,
      meetingType: v.topic.meetingType,
      topicId,
      createdAt: v.topic.createdAt.toISOString(),
    }));
  }
}
