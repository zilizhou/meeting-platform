import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import {
  MeetingType,
  RoleCode,
  SupervisionStatus,
  TopicStatus,
} from '../common/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { hasAnyRole, hasSchoolWideAccess } from '../common/roles';
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  materialsForCategory,
  withTempMotionMaterials,
} from '../topics/material-templates';

export class FeedbackDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  content!: string;
}

@Injectable()
export class SupervisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private canManageTask(user: AuthUser, ownerId: string) {
    if (user.isSchoolAdmin) return true;
    if (user.sub === ownerId) return true;
    return hasAnyRole(user, [
      RoleCode.COLLEGE_ADMIN,
      RoleCode.MEETING_SECRETARY,
      RoleCode.SECRETARY,
    ]);
  }

  private canUrge(user: AuthUser) {
    if (user.isSchoolAdmin) return true;
    return hasAnyRole(user, [
      RoleCode.COLLEGE_ADMIN,
      RoleCode.MEETING_SECRETARY,
      RoleCode.SECRETARY,
      RoleCode.DEAN,
    ]);
  }

  async list(user: AuthUser) {
    await this.scanOverdue(user, false);

    const tasks = await this.prisma.supervisionTask.findMany({
      where: hasSchoolWideAccess(user)
        ? undefined
        : {
            resolution: {
              topic: { collegeId: user.collegeId ?? '__none__' },
            },
          },
      include: {
        resolution: {
          include: {
            topic: {
              include: {
                college: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
        owner: { select: { id: true, realName: true } },
        feedbacks: true,
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
    return tasks;
  }

  /** 扫描到期未办结任务 → 标记 OVERDUE */
  async scanOverdue(user: AuthUser, notify = true) {
    const now = new Date();
    const candidates = await this.prisma.supervisionTask.findMany({
      where: {
        status: { notIn: [SupervisionStatus.DONE, SupervisionStatus.OVERDUE] },
        dueAt: { lt: now },
        ...(hasSchoolWideAccess(user)
          ? {}
          : {
              resolution: {
                topic: { collegeId: user.collegeId ?? '__none__' },
              },
            }),
      },
      include: {
        resolution: { include: { topic: true } },
      },
    });

    let marked = 0;
    for (const task of candidates) {
      await this.prisma.supervisionTask.update({
        where: { id: task.id },
        data: { status: SupervisionStatus.OVERDUE },
      });
      marked += 1;
      if (notify) {
        await this.notifications.notify({
          userId: task.ownerId,
          collegeId: task.resolution.topic.collegeId,
          type: 'SUPERVISION_OVERDUE',
          title: `督办已逾期：${task.title}`,
          content: `截止时间 ${task.dueAt?.toLocaleString('zh-CN') || ''}，请尽快反馈或办结`,
          link: '/supervisions',
        });
      }
    }

    const overdueCount = await this.prisma.supervisionTask.count({
      where: {
        status: SupervisionStatus.OVERDUE,
        ...(hasSchoolWideAccess(user)
          ? {}
          : {
              resolution: {
                topic: { collegeId: user.collegeId ?? undefined },
              },
            }),
      },
    });

    return { marked, overdueCount, scannedAt: now.toISOString() };
  }

  async feedback(user: AuthUser, taskId: string, content: string) {
    const task = await this.prisma.supervisionTask.findUnique({
      where: { id: taskId },
      include: { resolution: { include: { topic: true } } },
    });
    if (!task) throw new NotFoundException('督办任务不存在');
    if (!hasSchoolWideAccess(user) && task.resolution.topic.collegeId !== user.collegeId) {
      throw new ForbiddenException();
    }
    if (!this.canManageTask(user, task.ownerId)) {
      throw new ForbiddenException('仅责任人或学院管理员可反馈督办');
    }

    await this.prisma.supervisionFeedback.create({
      data: { taskId, userId: user.sub, content },
    });
    return this.prisma.supervisionTask.update({
      where: { id: taskId },
      data: { status: SupervisionStatus.FEEDBACK },
      include: { feedbacks: true },
    });
  }

  async complete(user: AuthUser, taskId: string) {
    const task = await this.prisma.supervisionTask.findUnique({
      where: { id: taskId },
      include: { resolution: { include: { topic: true } } },
    });
    if (!task) throw new NotFoundException('督办任务不存在');
    if (!hasSchoolWideAccess(user) && task.resolution.topic.collegeId !== user.collegeId) {
      throw new ForbiddenException();
    }
    if (!this.canManageTask(user, task.ownerId)) {
      throw new ForbiddenException('仅责任人或学院管理员可办结督办');
    }
    return this.prisma.supervisionTask.update({
      where: { id: taskId },
      data: { status: SupervisionStatus.DONE },
    });
  }

  /** 办公室/主要负责人催办：推送站内消息并累计次数 */
  async urge(user: AuthUser, taskId: string) {
    if (!this.canUrge(user)) {
      throw new ForbiddenException('仅办公室或党政主要负责人可催办');
    }
    const task = await this.prisma.supervisionTask.findUnique({
      where: { id: taskId },
      include: { resolution: { include: { topic: true } } },
    });
    if (!task) throw new NotFoundException('督办任务不存在');
    if (!hasSchoolWideAccess(user) && task.resolution.topic.collegeId !== user.collegeId) {
      throw new ForbiddenException();
    }
    if (task.status === SupervisionStatus.DONE) {
      throw new BadRequestException('已办结任务无需催办');
    }

    const updated = await this.prisma.supervisionTask.update({
      where: { id: taskId },
      data: {
        urgeCount: { increment: 1 },
        lastUrgeAt: new Date(),
      },
      include: {
        owner: { select: { id: true, realName: true } },
        resolution: { include: { topic: true } },
      },
    });

    await this.notifications.notify({
      userId: task.ownerId,
      collegeId: task.resolution.topic.collegeId,
      type: 'SUPERVISION_URGE',
      title: `督办催办：${task.title}`,
      content: `请尽快反馈落实情况（第 ${updated.urgeCount} 次催办）`,
      link: '/supervisions',
    });

    await this.audit.log({
      user,
      action: 'URGE',
      resource: 'SupervisionTask',
      resourceId: taskId,
      detail: { urgeCount: updated.urgeCount },
    });

    return updated;
  }

  /**
   * 执行中重大调整：禁止直接改决议，回流生成新议题重新上会。
   */
  async requestAdjust(user: AuthUser, taskId: string, reason: string) {
    const task = await this.prisma.supervisionTask.findUnique({
      where: { id: taskId },
      include: {
        resolution: {
          include: {
            topic: {
              include: { category: true },
            },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('督办任务不存在');
    if (!hasSchoolWideAccess(user) && task.resolution.topic.collegeId !== user.collegeId) {
      throw new ForbiddenException();
    }
    if (!this.canManageTask(user, task.ownerId)) {
      throw new ForbiddenException('仅责任人或学院管理员可申请重大调整');
    }
    if (task.status === SupervisionStatus.DONE) {
      throw new BadRequestException('已办结任务不可申请调整');
    }
    if (task.status === SupervisionStatus.ADJUST_REQUEST) {
      throw new BadRequestException('已申请调整，请勿重复提交');
    }

    const source = task.resolution.topic;
    const materials = withTempMotionMaterials(
      materialsForCategory(source.meetingType, source.category?.code || null),
      false,
    );

    const newTopic = await this.prisma.topic.create({
      data: {
        collegeId: source.collegeId,
        meetingType: source.meetingType,
        title: `【重大调整回流】${source.title}`,
        content: `源自督办重大调整申请。原决议：${task.resolution.resultType}。调整理由：${reason}`,
        categoryId: source.categoryId,
        proposerId: user.sub,
        status: TopicStatus.DRAFT,
        needPartyPrecheck: source.needPartyPrecheck,
        relatedPartyResolutionId: source.relatedPartyResolutionId,
        isMajor: true,
        isTempMotion: false,
        isEmergency: false,
        materials: { create: materials },
      },
    });

    await this.prisma.supervisionFeedback.create({
      data: {
        taskId,
        userId: user.sub,
        content: `申请重大调整回流：${reason} → 新议题 ${newTopic.id}`,
      },
    });

    const updated = await this.prisma.supervisionTask.update({
      where: { id: taskId },
      data: { status: SupervisionStatus.ADJUST_REQUEST },
      include: {
        owner: { select: { id: true, realName: true } },
        resolution: { include: { topic: true } },
      },
    });

    await this.notifications.notify({
      userId: task.ownerId,
      collegeId: source.collegeId,
      type: 'SUPERVISION_ADJUST',
      title: `督办重大调整：${task.title}`,
      content: '已回流生成新议题，须重新上会，不得直接改原决议',
      link:
        source.meetingType === MeetingType.PARTY_COMMITTEE
          ? `/topics/${newTopic.id}?from=party`
          : `/topics/${newTopic.id}`,
    });

    await this.audit.log({
      user,
      action: 'REQUEST_ADJUST',
      resource: 'SupervisionTask',
      resourceId: taskId,
      detail: { newTopicId: newTopic.id, reason },
    });

    return {
      task: updated,
      newTopicId: newTopic.id,
      message: '已申请重大调整并回流新议题，请重新走审题上会流程',
    };
  }
}
