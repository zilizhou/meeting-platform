import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../files/files.service';
import { AuthUser } from '../common/types';
import {
  JointReviewSide,
  MeetingStatus,
  MeetingType,
  ResolutionType,
  RoleCode,
  SupervisionStatus,
  TopicStatus,
} from '../common/constants';
import { assertAnyRole, isCollegeVisible, prismaCollegeIdFilter, PARTY_MINUTES_SIGN_ROLES, STAFF_ROLES } from '../common/roles';
import { assertPartyMeetingCanOpen, FIRST_TOPIC_CODE } from '../common/first-topic';
import {
  currentPeriodRange,
  type FrequencyPeriod,
} from '../common/academic-term';
import {
  AbsentOpinionDto,
  CreateMeetingDto,
  DiscussDto,
  LeaveDto,
  MinutesDto,
  ResolveDto,
  VoteDto,
} from './dto/meeting.dto';

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
  ) {}

  private requireCollege(user: AuthUser) {
    if (!user.collegeId) throw new ForbiddenException('当前账号未绑定学院');
    return user.collegeId;
  }

  /** 会中操作（签到/讨论/表决/决议）状态校验；已排期可签到，讨论表决须进行中 */
  private assertInSession(
    meeting: { status: string },
    action = '操作',
    allowScheduled = false,
  ) {
    if (meeting.status === MeetingStatus.ENDED) {
      throw new BadRequestException(`会议已结束，不能${action}`);
    }
    if (meeting.status === MeetingStatus.RESOLVED) {
      throw new BadRequestException(`会议已决议，不能${action}`);
    }
    if (meeting.status === MeetingStatus.ARCHIVED) {
      throw new BadRequestException(`会议已归档，不能${action}`);
    }
    if (meeting.status === MeetingStatus.IN_PROGRESS) return;
    if (allowScheduled && meeting.status === MeetingStatus.SCHEDULED) return;
    if (meeting.status === MeetingStatus.SCHEDULED) {
      throw new BadRequestException(`请先开始会议或完成签到后再${action}`);
    }
    throw new BadRequestException(`当前会议状态不允许${action}`);
  }

  async create(user: AuthUser, dto: CreateMeetingDto) {
    const collegeId = this.requireCollege(user);
    const meetingType = dto.meetingType || MeetingType.JOINT_CONFERENCE;
    const roster = await this.prisma.rosterMember.findMany({
      where: { collegeId, meetingType },
      orderBy: { sortOrder: 'asc' },
    });
    const formalRoster = roster.filter((r) => r.isFormal);
    if (!formalRoster.length) {
      throw new BadRequestException(
        meetingType === MeetingType.PARTY_COMMITTEE
          ? '请先维护党组织会议正式成员名单'
          : '请先维护党政联席会正式成员名单',
      );
    }

    const topicIds = dto.topicIds || [];
    if (!topicIds.length) {
      throw new BadRequestException('创建会议至少选择一项议题');
    }
    const topicsToAttach = await this.prisma.topic.findMany({
      where: { id: { in: topicIds } },
      include: { category: true },
    });
    if (topicsToAttach.length !== new Set(topicIds).size) {
      throw new BadRequestException('部分议题不存在，不能创建会议');
    }
    for (const t of topicsToAttach) {
      if (t.collegeId !== collegeId) throw new ForbiddenException('议题不属于本院');
      if (t.meetingType !== meetingType) {
        throw new BadRequestException(
          `议题「${t.title}」会议类型不匹配，不能入本会议程`,
        );
      }
      if (t.meetingId) {
        throw new BadRequestException(`议题「${t.title}」已入其他会议议程`);
      }
      if (t.status !== TopicStatus.APPROVED) {
        throw new BadRequestException(
          meetingType === MeetingType.JOINT_CONFERENCE
            ? `议题「${t.title}」尚未完成书记、院长双审，不能入议程`
            : `议题「${t.title}」尚未完成书记审题，不能入议程`,
        );
      }

      if (meetingType === MeetingType.JOINT_CONFERENCE) {
        const dualReview = await this.compliance.checkDualReview(t.id);
        if (!dualReview.passed) {
          throw new BadRequestException(
            `议题「${t.title}」未完成书记、院长双审，不能入会议程`,
          );
        }
      }

      if (t.isTempMotion) {
        const tempMotion = await this.compliance.checkTempMotion(t.id);
        if (!tempMotion.passed) {
          throw new BadRequestException(
            `临时动议「${t.title}」未完成规定审签，不能入会议程`,
          );
        }
      }
    }

    assertPartyMeetingCanOpen(meetingType, topicsToAttach);

    const isMajor = dto.isMajor || false;
    const meeting = await this.prisma.meeting.create({
      data: {
        collegeId,
        meetingType,
        title: dto.title,
        periodNo: dto.periodNo,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        hostUserId: user.sub,
        status: MeetingStatus.SCHEDULED,
        isMajor,
        quorumRatio: isMajor ? 2 / 3 : 0.5,
        shouldAttend: formalRoster.length,
        attendances: {
          create: roster.map((r) => ({
            userId: r.userId,
            isFormal: r.isFormal,
          })),
        },
      },
      include: { attendances: true },
    });

    if (topicIds.length) {
      const ordered = [...topicsToAttach].sort((a, b) => {
        const aFirst = a.category?.code === FIRST_TOPIC_CODE ? 0 : 1;
        const bFirst = b.category?.code === FIRST_TOPIC_CODE ? 0 : 1;
        if (aFirst !== bFirst) return aFirst - bFirst;
        return topicIds.indexOf(a.id) - topicIds.indexOf(b.id);
      });
      for (let i = 0; i < ordered.length; i++) {
        await this.prisma.topic.update({
          where: { id: ordered[i].id },
          data: {
            meetingId: meeting.id,
            status: TopicStatus.ON_AGENDA,
            sortOrder: i,
          },
        });
      }
    }

    await this.audit.log({
      user,
      action: 'CREATE',
      resource: 'Meeting',
      resourceId: meeting.id,
      detail: { meetingType },
    });

    const from =
      meetingType === MeetingType.PARTY_COMMITTEE ? '?from=party' : '';
    await this.notifications.notifyMany(
      roster.map((r) => ({
        userId: r.userId,
        collegeId,
        type: 'MEETING',
        title: `会议已排期：${dto.title}`,
        content: '请知悉会议时间与入会议题；会后由秘书登记决议并整理纪要。',
        link: `/meetings/${meeting.id}${from}`,
      })),
    );

    return this.detail(user, meeting.id);
  }

  async list(user: AuthUser, meetingType?: string, status?: string) {
    return this.prisma.meeting.findMany({
      where: {
        ...prismaCollegeIdFilter(user),
        ...(meetingType ? { meetingType } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        topics: {
          select: {
            id: true,
            title: true,
            status: true,
            category: { select: { code: true, name: true } },
            resolution: { select: { id: true } },
          },
        },
        minutes: { select: { id: true, effectiveAt: true } },
        _count: { select: { attendances: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 本院当前周期两会召开进度（学期/规定频次） */
  async holding(user: AuthUser) {
    const collegeId = user.collegeId;
    if (!collegeId) {
      throw new ForbiddenException('当前账号未绑定学院');
    }
    const rules = await this.prisma.meetingFrequencyRule.findMany();
    const resolve = (meetingType: string) =>
      rules.find((r) => r.collegeId === collegeId && r.meetingType === meetingType) ||
      rules.find((r) => r.collegeId === '' && r.meetingType === meetingType) || {
        period: 'SEMESTER',
        requiredCount: 1,
      };
    const countIn = async (meetingType: string, start: Date, end: Date) =>
      this.prisma.meeting.count({
        where: {
          collegeId,
          meetingType,
          OR: [
            { scheduledAt: { gte: start, lt: end } },
            { scheduledAt: null, createdAt: { gte: start, lt: end } },
          ],
        },
      });

    const partyRule = resolve(MeetingType.PARTY_COMMITTEE);
    const jointRule = resolve(MeetingType.JOINT_CONFERENCE);
    const partyRange = currentPeriodRange(partyRule.period as FrequencyPeriod);
    const jointRange = currentPeriodRange(jointRule.period as FrequencyPeriod);
    const [partyCount, jointCount] = await Promise.all([
      countIn(MeetingType.PARTY_COMMITTEE, partyRange.start, partyRange.end),
      countIn(MeetingType.JOINT_CONFERENCE, jointRange.start, jointRange.end),
    ]);
    return {
      label: partyRange.label,
      period: partyRule.period,
      party: {
        required: partyRule.requiredCount,
        count: partyCount,
        held: partyCount >= partyRule.requiredCount,
        label: partyRange.label,
      },
      joint: {
        required: jointRule.requiredCount,
        count: jointCount,
        held: jointCount >= jointRule.requiredCount,
        label: jointRange.label,
      },
    };
  }

  async detail(user: AuthUser, id: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        college: { select: { id: true, name: true } },
        topics: {
          include: {
            category: { select: { id: true, name: true, code: true } },
            proposer: { select: { id: true, realName: true, title: true } },
            materials: { orderBy: { createdAt: 'asc' } },
            jointReviews: true,
            resolution: true,
            votes: {
              include: { user: { select: { id: true, realName: true, title: true } } },
              orderBy: { createdAt: 'asc' },
            },
            discussions: {
              include: { user: { select: { id: true, realName: true, title: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        attendances: {
          include: { user: { select: { id: true, realName: true, title: true } } },
        },
        minutes: { include: { signs: { include: { user: { select: { realName: true } } } } } },
      },
    });
    if (!meeting) throw new NotFoundException('会议不存在');
    if (!isCollegeVisible(user, meeting.collegeId)) {
      throw new ForbiddenException();
    }
    return meeting;
  }

  async start(user: AuthUser, id: string) {
    const meeting = await this.detail(user, id);
    if (
      meeting.status === MeetingStatus.ENDED ||
      meeting.status === MeetingStatus.RESOLVED ||
      meeting.status === MeetingStatus.ARCHIVED
    ) {
      throw new BadRequestException('会议已结束，不能再次开始');
    }
    if (meeting.status === MeetingStatus.IN_PROGRESS) {
      return meeting;
    }
    assertPartyMeetingCanOpen(meeting.meetingType, meeting.topics);
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.IN_PROGRESS },
    });
    await this.audit.log({
      user,
      action: 'START_MEETING',
      resource: 'Meeting',
      resourceId: id,
    });
    return updated;
  }

  /** 标记本场已召开：已排期/进行中 → 已结束（待登记决议与纪要） */
  async end(user: AuthUser, id: string) {
    const meeting = await this.detail(user, id);
    if (meeting.status === MeetingStatus.ENDED) {
      return meeting;
    }
    if (
      meeting.status === MeetingStatus.RESOLVED ||
      meeting.status === MeetingStatus.ARCHIVED
    ) {
      throw new BadRequestException('会议已决议或归档，无需再结束');
    }
    if (
      meeting.status !== MeetingStatus.IN_PROGRESS &&
      meeting.status !== MeetingStatus.SCHEDULED &&
      meeting.status !== MeetingStatus.DRAFT
    ) {
      throw new BadRequestException('当前状态不能标记已召开');
    }
    if (meeting.meetingType === MeetingType.PARTY_COMMITTEE) {
      assertPartyMeetingCanOpen(meeting.meetingType, meeting.topics);
    }

    await this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.ENDED },
    });
    await this.audit.log({
      user,
      action: 'END_MEETING',
      resource: 'Meeting',
      resourceId: id,
    });
    return this.detail(user, id);
  }

  async checkIn(user: AuthUser, meetingId: string, userId?: string) {
    let meeting = await this.detail(user, meetingId);
    this.assertInSession(meeting, '签到', true);
    // 会前签到即视为开会：已排期 → 进行中
    if (meeting.status === MeetingStatus.SCHEDULED) {
      assertPartyMeetingCanOpen(meeting.meetingType, meeting.topics);
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.IN_PROGRESS },
      });
      meeting = await this.detail(user, meetingId);
    }
    const targetUserId = userId || user.sub;
    if (targetUserId !== user.sub) {
      assertAnyRole(
        user,
        [...STAFF_ROLES],
        '仅会议秘书/学院管理员可为他人代签到',
      );
    }
    const attendance = meeting.attendances.find((a) => a.userId === targetUserId);
    if (!attendance) throw new BadRequestException('不在参会名单中');
    if (attendance.leaveNote) {
      throw new BadRequestException('已请假报备，不能再签到；如需到会请先取消请假');
    }

    await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkedIn: true, checkedAt: new Date() },
    });

    const refreshed = await this.prisma.attendance.findMany({
      where: { meetingId, isFormal: true },
    });
    const actualAttend = refreshed.filter((a) => a.checkedIn).length;
    const ratio = meeting.isMajor ? 2 / 3 : 1 / 2;
    const canResolve =
      meeting.shouldAttend > 0 && actualAttend / meeting.shouldAttend >= ratio - 1e-9;

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { actualAttend, canResolve },
    });
    await this.compliance.checkQuorum(meetingId);
    return this.detail(user, meetingId);
  }

  /** 会前请假：不影响 shouldAttend 应到基数，仅标记 leaveNote */
  async requestLeave(user: AuthUser, meetingId: string, dto: LeaveDto) {
    const meeting = await this.detail(user, meetingId);
    if (
      meeting.status === MeetingStatus.ARCHIVED ||
      meeting.status === MeetingStatus.RESOLVED ||
      meeting.status === MeetingStatus.ENDED
    ) {
      throw new BadRequestException('会议已结束或归档，不能请假');
    }
    const attendance = meeting.attendances.find((a) => a.userId === user.sub);
    if (!attendance) throw new BadRequestException('不在参会名单中');
    if (attendance.checkedIn) {
      throw new BadRequestException('已签到，不能再请假');
    }

    await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        leaveNote: dto.reason.trim(),
        leaveAt: new Date(),
        checkedIn: false,
        checkedAt: null,
      },
    });

    await this.audit.log({
      user,
      action: 'LEAVE',
      resource: 'Meeting',
      resourceId: meetingId,
      detail: { reason: dto.reason.trim() },
    });
    return this.detail(user, meetingId);
  }

  async archive(user: AuthUser, meetingId: string) {
    const meeting = await this.detail(user, meetingId);
    if (meeting.status === MeetingStatus.ARCHIVED) {
      return meeting;
    }
    if (!meeting.minutes?.effectiveAt) {
      throw new BadRequestException('纪要尚未生效，不能归档');
    }
    if (meeting.status !== MeetingStatus.RESOLVED) {
      throw new BadRequestException('仅已决议会议可归档');
    }

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.ARCHIVED },
    });
    await this.audit.log({
      user,
      action: 'ARCHIVE',
      resource: 'Meeting',
      resourceId: meetingId,
    });
    return this.detail(user, meetingId);
  }

  async discuss(user: AuthUser, meetingId: string, topicId: string, dto: DiscussDto) {
    const meeting = await this.detail(user, meetingId);
    this.assertInSession(meeting, '讨论发言');
    const topic = meeting.topics.find((t) => t.id === topicId);
    if (!topic) throw new NotFoundException('议题不在本次会议');

    const attendance = meeting.attendances.find((a) => a.userId === user.sub);
    if (!attendance) throw new BadRequestException('不在参会名单中，不能发言');
    if (attendance.leaveNote) {
      throw new BadRequestException('已请假，不能参与讨论');
    }
    if (!attendance.checkedIn) {
      throw new BadRequestException('请先签到再发言');
    }

    const avoidIds: string[] = (() => {
      try {
        return JSON.parse(topic.avoidUserIds || '[]');
      } catch {
        return [];
      }
    })();
    if (avoidIds.includes(user.sub)) {
      throw new ForbiddenException('您已回避本议题，不得参与讨论发言');
    }

    const isLeader =
      user.roles.includes(RoleCode.SECRETARY) || user.roles.includes(RoleCode.DEAN);
    const wantFinal = dto.isFinal === true || isLeader;

    if (wantFinal) {
      // 书记/院长最后表态：其他已签到正式成员（非回避）须已发言
      const formalChecked = meeting.attendances.filter(
        (a) => a.isFormal && a.checkedIn && a.userId !== user.sub,
      );
      const pending = formalChecked.filter((a) => {
        if (avoidIds.includes(a.userId)) return false;
        return !topic.discussions.some((d) => d.userId === a.userId);
      });
      if (pending.length > 0) {
        const names = pending
          .map((a) => a.user?.realName || a.userId)
          .join('、');
        throw new BadRequestException(
          `书记/院长须最后表态：尚有正式成员未发言（${names}）`,
        );
      }
    } else {
      // 普通成员：若书记或院长已作最后表态，则禁止再发言
      const leaderFinal = topic.discussions.find((d) => d.isFinal);
      if (leaderFinal) {
        throw new BadRequestException('主要负责人已作最后表态，讨论环节已结束');
      }
    }

    return this.prisma.discussionOpinion.create({
      data: {
        topicId,
        userId: user.sub,
        opinion: dto.opinion,
        reason: dto.reason,
        isFinal: wantFinal,
      },
    });
  }

  async vote(user: AuthUser, meetingId: string, topicId: string, dto: VoteDto, forUserId?: string) {
    const meeting = await this.detail(user, meetingId);
    this.assertInSession(meeting, '表决');
    const topic = meeting.topics.find((t) => t.id === topicId);
    if (!topic) throw new NotFoundException('议题不在本次会议');

    const canProxy =
      user.roles.includes(RoleCode.MEETING_SECRETARY) ||
      user.roles.includes(RoleCode.COLLEGE_ADMIN);
    const targetUserId = forUserId && canProxy ? forUserId : user.sub;

    const attendance = meeting.attendances.find((a) => a.userId === targetUserId);
    if (!attendance?.isFormal) {
      throw new ForbiddenException('列席人员无表决权');
    }
    if (attendance.leaveNote) {
      throw new BadRequestException('已请假，不能参与表决');
    }
    if (!attendance.checkedIn) {
      throw new BadRequestException('请先签到再表决');
    }

    const avoidIds: string[] = (() => {
      try {
        return JSON.parse(topic.avoidUserIds || '[]');
      } catch {
        return [];
      }
    })();
    if (avoidIds.includes(targetUserId)) {
      throw new ForbiddenException('该成员已回避本议题，不得参与表决');
    }

    const existing = await this.prisma.voteRecord.findFirst({
      where: { topicId, userId: targetUserId, voteCounted: true },
    });
    if (existing) throw new BadRequestException('该成员已表决，不可重复提交');

    return this.prisma.voteRecord.create({
      data: {
        topicId,
        userId: targetUserId,
        method: dto.method,
        approve: dto.approve,
        voteCounted: true,
      },
    });
  }

  /**
   * 缺席书面意见：会前/会中登记，不得计入票数（规则：缺席意见不计票）
   */
  async submitAbsentOpinion(
    user: AuthUser,
    meetingId: string,
    topicId: string,
    dto: AbsentOpinionDto,
  ) {
    const meeting = await this.detail(user, meetingId);
    this.assertInSession(meeting, '登记缺席意见', true);
    const topic = meeting.topics.find((t) => t.id === topicId);
    if (!topic) throw new NotFoundException('议题不在本次会议');

    let targetUserId = user.sub;
    if (dto.userId && dto.userId !== user.sub) {
      assertAnyRole(
        user,
        [...STAFF_ROLES],
        '仅会议秘书/学院管理员可为他人代登缺席意见',
      );
      targetUserId = dto.userId;
    }

    const attendance = meeting.attendances.find((a) => a.userId === targetUserId);
    if (!attendance?.isFormal) {
      throw new ForbiddenException('仅正式成员可提交缺席书面意见');
    }
    if (attendance.checkedIn) {
      throw new BadRequestException('已签到成员请直接表决，勿登记缺席意见');
    }

    const avoidIds: string[] = (() => {
      try {
        return JSON.parse(topic.avoidUserIds || '[]');
      } catch {
        return [];
      }
    })();
    if (avoidIds.includes(targetUserId)) {
      throw new ForbiddenException('已回避本议题，不得提交意见');
    }

    const existing = await this.prisma.voteRecord.findFirst({
      where: { topicId, userId: targetUserId },
    });
    if (existing) {
      throw new BadRequestException('该成员已有表决或书面意见记录');
    }

    const record = await this.prisma.voteRecord.create({
      data: {
        topicId,
        userId: targetUserId,
        method: 'ORAL',
        approve: dto.approve,
        voteCounted: false,
        isAbsentOpinion: true,
      },
    });

    await this.audit.log({
      user,
      action: 'ABSENT_OPINION',
      resource: 'Topic',
      resourceId: topicId,
      detail: {
        meetingId,
        targetUserId,
        approve: dto.approve,
        reason: dto.reason,
        voteCounted: false,
      },
    });

    return record;
  }

  /** 演示/会务代录：为已签到正式成员批量登记赞成票（自动跳过回避人员） */
  async voteAllApprove(user: AuthUser, meetingId: string, topicId: string) {
    const meeting = await this.detail(user, meetingId);
    this.assertInSession(meeting, '代录表决');
    const topic = meeting.topics.find((t) => t.id === topicId);
    if (!topic) throw new NotFoundException('议题不在本次会议');

    const canProxy =
      user.roles.includes(RoleCode.MEETING_SECRETARY) ||
      user.roles.includes(RoleCode.COLLEGE_ADMIN) ||
      user.isSchoolAdmin;
    if (!canProxy) throw new ForbiddenException('仅会议秘书可代录表决');

    const avoidIds: string[] = (() => {
      try {
        return JSON.parse(topic.avoidUserIds || '[]');
      } catch {
        return [];
      }
    })();

    const results = [];
    let skippedAvoid = 0;
    for (const a of meeting.attendances) {
      if (!a.isFormal || !a.checkedIn || a.leaveNote) continue;
      if (avoidIds.includes(a.userId)) {
        skippedAvoid += 1;
        continue;
      }
      try {
        results.push(
          await this.vote(
            user,
            meetingId,
            topicId,
            { method: 'HAND', approve: true },
            a.userId,
          ),
        );
      } catch {
        // 已表决则跳过
      }
    }
    return { count: results.length, skippedAvoid };
  }

  async resolve(user: AuthUser, meetingId: string, topicId: string, dto: ResolveDto) {
    const meeting = await this.detail(user, meetingId);
    if (
      meeting.status === MeetingStatus.ARCHIVED
    ) {
      throw new BadRequestException('会议已归档，不能再登记决议');
    }
    const topic = meeting.topics.find((t) => t.id === topicId);
    if (!topic) throw new NotFoundException('议题不在本次会议');
    if (topic.resolution) {
      throw new BadRequestException('该议题已形成决议');
    }

    const resolution = await this.prisma.resolution.create({
      data: {
        topicId,
        resultType: dto.resultType,
        content: dto.content,
        isPublic: dto.isPublic ?? false,
        securityLevel:
          dto.securityLevel ||
          (dto.isPublic ? 'PUBLIC' : 'INTERNAL'),
      },
    });

    await this.prisma.topic.update({
      where: { id: topicId },
      data: {
        status:
          dto.resultType === ResolutionType.REJECTED
            ? TopicStatus.REJECTED
            : dto.resultType === ResolutionType.DEFERRED
              ? TopicStatus.DISCUSSED
              : TopicStatus.RESOLVED,
      },
    });

    if (
      dto.resultType === ResolutionType.APPROVED ||
      dto.resultType === ResolutionType.PRINCIPLE_APPROVED
    ) {
      const ownerId = dto.ownerId || user.sub;
      if (dto.ownerId) {
        const owner = await this.prisma.user.findUnique({
          where: { id: dto.ownerId },
        });
        if (!owner) {
          throw new BadRequestException('督办责任人不存在');
        }
        if (!user.isSchoolAdmin && owner.collegeId !== meeting.collegeId) {
          throw new ForbiddenException('督办责任人须为本院用户');
        }
      }
      await this.prisma.supervisionTask.create({
        data: {
          resolutionId: resolution.id,
          title: `督办：${topic.title}`,
          ownerId,
          status: SupervisionStatus.PENDING,
          dueAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        },
      });
      await this.notifications.notify({
        userId: ownerId,
        collegeId: meeting.collegeId,
        type: 'SUPERVISION',
        title: `督办待办：${topic.title}`,
        content: '决议已形成，请及时反馈落实情况',
        link: '/supervisions',
      });
    }

    // 党组织会议会中决议可直接转联席会
    if (
      meeting.meetingType === MeetingType.PARTY_COMMITTEE &&
      dto.transferToJoint &&
      (dto.resultType === ResolutionType.APPROVED ||
        dto.resultType === ResolutionType.PRINCIPLE_APPROVED)
    ) {
      const existing = await this.prisma.transferLink.findUnique({
        where: { sourceTopicId: topicId },
      });
      if (!existing) {
        const transferCategory = await this.prisma.categoryDict.findFirst({
          where: {
            meetingType: MeetingType.JOINT_CONFERENCE,
            code: 'PARTY_TRANSFER',
            OR: [{ collegeId: null }, { collegeId: meeting.collegeId }],
          },
        });
        const target = await this.prisma.topic.create({
          data: {
            collegeId: meeting.collegeId,
            meetingType: MeetingType.JOINT_CONFERENCE,
            title: `【党委转办】${topic.title}`,
            content: `源自党组织会议决议。${dto.content || ''}`,
            categoryId: transferCategory?.id,
            proposerId: user.sub,
            status: TopicStatus.DRAFT,
            needPartyPrecheck: true,
            relatedPartyResolutionId: resolution.id,
            isMajor: topic.isMajor,
            materials: {
              create: [
                {
                  name: '党组织会议决议摘要/依据',
                  requiredKey: 'party_resolution',
                  isRequired: true,
                  uploaded: true,
                  filePath: `party-resolution://${resolution.id}`,
                  originalName: '党组织会议决议关联',
                },
                {
                  name: '调研报告/落实方案',
                  requiredKey: 'survey',
                  isRequired: true,
                },
              ],
            },
          },
        });
        await this.prisma.transferLink.create({
          data: {
            sourceTopicId: topicId,
            targetTopicId: target.id,
            sourceResolutionNote: dto.content || null,
          },
        });
        const secretaries = await this.prisma.user.findMany({
          where: {
            collegeId: meeting.collegeId,
            roles: { some: { role: { code: RoleCode.MEETING_SECRETARY } } },
          },
          select: { id: true },
        });
        await this.notifications.notifyMany(
          secretaries.map((s) => ({
            userId: s.id,
            collegeId: meeting.collegeId,
            type: 'TRANSFER',
            title: `党委转办联席会：${topic.title}`,
            content: '已生成联席会议题草稿，请完善材料后提交双审。',
            link: `/topics/${target.id}`,
          })),
        );
      }
    }

    await this.audit.log({
      user,
      action: 'RESOLVE',
      resource: 'Topic',
      resourceId: topicId,
      detail: {
        resultType: dto.resultType,
        transferToJoint: Boolean(dto.transferToJoint),
      },
    });
    return this.detail(user, meetingId);
  }

  async saveMinutes(user: AuthUser, meetingId: string, dto: MinutesDto) {
    const meeting = await this.detail(user, meetingId);
    if (meeting.status === MeetingStatus.ARCHIVED) {
      throw new BadRequestException('会议已归档，不能修改纪要');
    }
    if (
      meeting.status !== MeetingStatus.IN_PROGRESS &&
      meeting.status !== MeetingStatus.ENDED &&
      meeting.status !== MeetingStatus.RESOLVED &&
      meeting.status !== MeetingStatus.SCHEDULED
    ) {
      throw new BadRequestException('当前状态不能起草纪要');
    }
    const minutes = await this.prisma.minutes.upsert({
      where: { meetingId },
      create: { meetingId, content: dto.content },
      update: { content: dto.content, version: { increment: 1 } },
    });
    await this.notifyMinutesSigners(meeting, meetingId);
    return minutes;
  }

  async uploadMinutesFile(user: AuthUser, meetingId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择要上传的纪要文件');
    this.files.assertAllowed(file.originalname, file.mimetype);
    const meeting = await this.detail(user, meetingId);
    if (meeting.status === MeetingStatus.ARCHIVED) {
      throw new BadRequestException('会议已归档，不能修改纪要');
    }
    if (
      meeting.status !== MeetingStatus.IN_PROGRESS &&
      meeting.status !== MeetingStatus.ENDED &&
      meeting.status !== MeetingStatus.RESOLVED &&
      meeting.status !== MeetingStatus.SCHEDULED &&
      meeting.status !== MeetingStatus.DRAFT
    ) {
      throw new BadRequestException('当前状态不能上传纪要');
    }

    const dir = this.files.ensureMeetingDir(meeting.collegeId, meetingId);
    const storedName = this.files.buildStoredName(file.originalname);
    writeFileSync(join(dir, storedName), file.buffer);
    const relativePath = this.files.relativeMeetingPath(
      meeting.collegeId,
      meetingId,
      storedName,
    );

    const existing = meeting.minutes;
    if (existing?.filePath) {
      try {
        const oldAbs = this.files.absolutePath(existing.filePath);
        if (existsSync(oldAbs)) unlinkSync(oldAbs);
      } catch {
        // ignore
      }
    }

    const placeholder = existing?.content?.trim()
      ? existing.content
      : `线下纪要附件：${file.originalname}`;

    const minutes = await this.prisma.minutes.upsert({
      where: { meetingId },
      create: {
        meetingId,
        content: placeholder,
        filePath: relativePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      },
      update: {
        filePath: relativePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        version: { increment: 1 },
        ...(existing?.content?.trim() ? {} : { content: placeholder }),
      },
    });

    await this.audit.log({
      user,
      action: 'UPLOAD',
      resource: 'Minutes',
      resourceId: minutes.id,
      detail: { originalName: file.originalname, size: file.size },
    });
    await this.notifyMinutesSigners(meeting, meetingId);
    return this.detail(user, meetingId);
  }

  async downloadMinutesFile(user: AuthUser, meetingId: string) {
    const meeting = await this.detail(user, meetingId);
    const minutes = meeting.minutes;
    if (!minutes?.filePath) {
      throw new NotFoundException('尚未上传线下纪要文件');
    }
    const abs = this.files.absolutePath(minutes.filePath);
    if (!existsSync(abs)) {
      throw new NotFoundException('纪要文件不存在或已被清理');
    }
    const filename = encodeURIComponent(minutes.originalName || '会议纪要');
    return {
      file: new StreamableFile(createReadStream(abs)),
      filename,
      mimeType: minutes.mimeType || 'application/octet-stream',
    };
  }

  private async notifyMinutesSigners(
    meeting: { collegeId: string; meetingType: string; title: string },
    meetingId: string,
  ) {
    const collegeUsers = await this.prisma.user.findMany({
      where: { collegeId: meeting.collegeId },
      include: { roles: { include: { role: true } } },
    });
    const from =
      meeting.meetingType === MeetingType.PARTY_COMMITTEE ? '?from=party' : '';
    const payloads = [];
    for (const u of collegeUsers) {
      const codes = u.roles.map((r) => r.role.code);
      const need =
        meeting.meetingType === MeetingType.PARTY_COMMITTEE
          ? codes.includes(RoleCode.SECRETARY) ||
            codes.includes(RoleCode.VICE_SECRETARY)
          : codes.includes(RoleCode.SECRETARY) || codes.includes(RoleCode.DEAN);
      if (!need) continue;
      payloads.push({
        userId: u.id,
        collegeId: meeting.collegeId,
        type: 'MINUTES_SIGN',
        title: `纪要待签：${meeting.title}`,
        content: '会议纪要已起草，请及时签署',
        link: `/meetings/${meetingId}${from}`,
      });
    }
    await this.notifications.notifyMany(payloads);
  }

  async signMinutes(user: AuthUser, meetingId: string) {
    const meeting = await this.detail(user, meetingId);
    if (!meeting.minutes) throw new BadRequestException('请先起草纪要');

    const isParty = meeting.meetingType === MeetingType.PARTY_COMMITTEE;

    if (isParty) {
      assertAnyRole(
        user,
        [...PARTY_MINUTES_SIGN_ROLES],
        '党组织会议纪要仅党委书记或副书记可签署',
      );
      const signedByRole = user.roles.includes(RoleCode.SECRETARY)
        ? RoleCode.SECRETARY
        : RoleCode.VICE_SECRETARY;
      await this.prisma.minutesSign.upsert({
        where: {
          minutesId_side: {
            minutesId: meeting.minutes.id,
            side: JointReviewSide.SECRETARY,
          },
        },
        create: {
          minutesId: meeting.minutes.id,
          userId: user.sub,
          side: JointReviewSide.SECRETARY,
        },
        update: {
          userId: user.sub,
          signedAt: new Date(),
        },
      });
      await this.prisma.minutes.update({
        where: { id: meeting.minutes.id },
        data: { effectiveAt: new Date() },
      });
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.RESOLVED },
      });
      await this.audit.log({
        user,
        action: 'SIGN_MINUTES',
        resource: 'Minutes',
        resourceId: meeting.minutes.id,
        detail: {
          side: 'SECRETARY',
          meetingType: 'PARTY_COMMITTEE',
          effective: true,
          signedByRole,
        },
      });
      return this.detail(user, meetingId);
    }

    const side = user.roles.includes(RoleCode.SECRETARY)
      ? JointReviewSide.SECRETARY
      : user.roles.includes(RoleCode.DEAN)
        ? JointReviewSide.DEAN
        : null;
    if (!side) throw new ForbiddenException('仅党委书记或院长可签署纪要');

    await this.prisma.minutesSign.upsert({
      where: {
        minutesId_side: { minutesId: meeting.minutes.id, side },
      },
      create: {
        minutesId: meeting.minutes.id,
        userId: user.sub,
        side,
      },
      update: {
        userId: user.sub,
        signedAt: new Date(),
      },
    });

    const check = await this.compliance.checkMinutesSign(meeting.minutes.id);
    if (check.passed) {
      await this.prisma.minutes.update({
        where: { id: meeting.minutes.id },
        data: { effectiveAt: new Date() },
      });
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.RESOLVED },
      });
    }

    await this.audit.log({
      user,
      action: 'SIGN_MINUTES',
      resource: 'Minutes',
      resourceId: meeting.minutes.id,
      detail: { side, effective: check.passed },
    });
    return this.detail(user, meetingId);
  }
}
