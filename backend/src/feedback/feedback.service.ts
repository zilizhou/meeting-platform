import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/types';
import { RoleCode } from '../common/constants';
import {
  assertCollegeVisible,
  hasSchoolWideAccess,
  isCollegeVisible,
  prismaCollegeIdFilter,
} from '../common/roles';

/** 院方可收发校级反馈的核心角色 */
export const FEEDBACK_COLLEGE_ROLES = [
  RoleCode.COLLEGE_ADMIN,
  RoleCode.SECRETARY,
  RoleCode.VICE_SECRETARY,
  RoleCode.DEAN,
  RoleCode.VICE_DEAN,
  RoleCode.MEETING_SECRETARY,
] as const;

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private isSchoolSide(user: AuthUser) {
    return hasSchoolWideAccess(user);
  }

  private isCollegeFeedbackRole(user: AuthUser) {
    return FEEDBACK_COLLEGE_ROLES.some((r) => user.roles?.includes(r));
  }

  private assertCanUseFeedback(user: AuthUser) {
    if (this.isSchoolSide(user) || this.isCollegeFeedbackRole(user)) return;
    throw new ForbiddenException('无权使用部门反馈');
  }

  private assertCanAccessCollege(user: AuthUser, collegeId: string) {
    if (this.isSchoolSide(user)) {
      assertCollegeVisible(user, collegeId);
      return;
    }
    if (user.collegeId !== collegeId || !this.isCollegeFeedbackRole(user)) {
      throw new ForbiddenException('仅可查看本院反馈');
    }
  }

  async listThreads(user: AuthUser, collegeId?: string) {
    this.assertCanUseFeedback(user);
    let whereCollege: { collegeId?: string | { in: string[] } } = {};

    if (this.isSchoolSide(user)) {
      if (collegeId) {
        assertCollegeVisible(user, collegeId);
        whereCollege = { collegeId };
      } else {
        whereCollege = prismaCollegeIdFilter(user);
      }
    } else {
      if (!user.collegeId) throw new ForbiddenException('未绑定学院');
      whereCollege = { collegeId: user.collegeId };
    }

    const items = await this.prisma.schoolFeedbackThread.findMany({
      where: whereCollege,
      include: {
        college: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, realName: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: { select: { id: true, realName: true } },
          },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });

    return {
      items: items.map((t) => ({
        id: t.id,
        collegeId: t.collegeId,
        college: t.college,
        subject: t.subject,
        createdBy: t.createdBy,
        lastMessageAt: t.lastMessageAt,
        createdAt: t.createdAt,
        messageCount: t._count.messages,
        lastMessage: t.messages[0]
          ? {
              id: t.messages[0].id,
              content: t.messages[0].content,
              createdAt: t.messages[0].createdAt,
              author: t.messages[0].author,
            }
          : null,
      })),
    };
  }

  async getThread(user: AuthUser, threadId: string) {
    this.assertCanUseFeedback(user);
    const thread = await this.prisma.schoolFeedbackThread.findUnique({
      where: { id: threadId },
      include: {
        college: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, realName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: {
                id: true,
                realName: true,
                collegeId: true,
                isSchoolAdmin: true,
                roles: { include: { role: { select: { code: true } } } },
              },
            },
          },
        },
      },
    });
    if (!thread) throw new NotFoundException('反馈不存在');
    this.assertCanAccessCollege(user, thread.collegeId);

    return {
      id: thread.id,
      collegeId: thread.collegeId,
      college: thread.college,
      subject: thread.subject,
      createdBy: thread.createdBy,
      lastMessageAt: thread.lastMessageAt,
      createdAt: thread.createdAt,
      messages: thread.messages.map((m) => {
        const roleCodes = m.author.roles.map((r) => r.role.code);
        const fromSchool =
          m.author.isSchoolAdmin ||
          roleCodes.includes(RoleCode.SCHOOL_ADMIN) ||
          roleCodes.includes(RoleCode.SCHOOL_VIEWER);
        return {
          id: m.id,
          content: m.content,
          createdAt: m.createdAt,
          author: {
            id: m.author.id,
            realName: m.author.realName,
            collegeId: m.author.collegeId,
          },
          fromSchool,
        };
      }),
    };
  }

  async createThread(
    user: AuthUser,
    dto: { collegeId: string; content: string; subject?: string },
  ) {
    if (!this.isSchoolSide(user)) {
      throw new ForbiddenException('仅校级用户可发起反馈');
    }
    assertCollegeVisible(user, dto.collegeId);
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('反馈内容不能为空');

    const college = await this.prisma.college.findUnique({
      where: { id: dto.collegeId },
      select: { id: true, name: true },
    });
    if (!college) throw new NotFoundException('学院不存在');

    const subject =
      dto.subject?.trim() ||
      (content.length > 40 ? `${content.slice(0, 40)}…` : content);

    const thread = await this.prisma.schoolFeedbackThread.create({
      data: {
        collegeId: dto.collegeId,
        createdById: user.sub,
        subject,
        messages: {
          create: {
            authorUserId: user.sub,
            content,
          },
        },
      },
      include: {
        college: { select: { id: true, name: true } },
      },
    });

    await this.notifyCollegeRecipients({
      collegeId: dto.collegeId,
      excludeUserId: user.sub,
      title: `校级反馈 · ${college.name}`,
      content: content.slice(0, 120),
      threadId: thread.id,
    });

    return this.getThread(user, thread.id);
  }

  async reply(user: AuthUser, threadId: string, contentRaw: string) {
    this.assertCanUseFeedback(user);
    const content = contentRaw.trim();
    if (!content) throw new BadRequestException('回复内容不能为空');

    const thread = await this.prisma.schoolFeedbackThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        collegeId: true,
        createdById: true,
        college: { select: { name: true } },
      },
    });
    if (!thread) throw new NotFoundException('反馈不存在');
    this.assertCanAccessCollege(user, thread.collegeId);

    await this.prisma.$transaction([
      this.prisma.schoolFeedbackMessage.create({
        data: {
          threadId,
          authorUserId: user.sub,
          content,
        },
      }),
      this.prisma.schoolFeedbackThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    if (this.isSchoolSide(user)) {
      await this.notifyCollegeRecipients({
        collegeId: thread.collegeId,
        excludeUserId: user.sub,
        title: `校级反馈 · ${thread.college.name}`,
        content: content.slice(0, 120),
        threadId,
      });
    } else {
      await this.notifySchoolParticipants({
        threadId,
        createdById: thread.createdById,
        excludeUserId: user.sub,
        collegeName: thread.college.name,
        content: content.slice(0, 120),
      });
    }

    return this.getThread(user, threadId);
  }

  private async collegeRecipientIds(collegeId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        collegeId,
        enabled: true,
        roles: {
          some: {
            role: { code: { in: [...FEEDBACK_COLLEGE_ROLES] } },
          },
        },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async notifyCollegeRecipients(opts: {
    collegeId: string;
    excludeUserId: string;
    title: string;
    content: string;
    threadId: string;
  }) {
    const ids = (await this.collegeRecipientIds(opts.collegeId)).filter(
      (id) => id !== opts.excludeUserId,
    );
    if (!ids.length) return;
    await this.notifications.notifyMany(
      ids.map((userId) => ({
        userId,
        collegeId: opts.collegeId,
        type: 'SCHOOL_FEEDBACK',
        title: opts.title,
        content: opts.content,
        link: `/feedback/${opts.threadId}`,
      })),
    );
  }

  private async notifySchoolParticipants(opts: {
    threadId: string;
    createdById: string;
    excludeUserId: string;
    collegeName: string;
    content: string;
  }) {
    const authors = await this.prisma.schoolFeedbackMessage.findMany({
      where: { threadId: opts.threadId },
      select: {
        authorUserId: true,
        author: {
          select: {
            isSchoolAdmin: true,
            roles: { include: { role: { select: { code: true } } } },
          },
        },
      },
    });
    const schoolIds = new Set<string>();
    schoolIds.add(opts.createdById);
    for (const row of authors) {
      const codes = row.author.roles.map((r) => r.role.code);
      if (
        row.author.isSchoolAdmin ||
        codes.includes(RoleCode.SCHOOL_ADMIN) ||
        codes.includes(RoleCode.SCHOOL_VIEWER)
      ) {
        schoolIds.add(row.authorUserId);
      }
    }
    schoolIds.delete(opts.excludeUserId);
    const ids = [...schoolIds];
    if (!ids.length) return;
    await this.notifications.notifyMany(
      ids.map((userId) => ({
        userId,
        type: 'SCHOOL_FEEDBACK',
        title: `${opts.collegeName} 回复了反馈`,
        content: opts.content,
        link: `/feedback/${opts.threadId}`,
      })),
    );
  }

  /** 院方是否具备反馈入口（供前端判断） */
  canCollegeAccess(user: AuthUser) {
    return this.isCollegeFeedbackRole(user) && !!user.collegeId;
  }

  isCollegeVisibleForSchool(user: AuthUser, collegeId: string) {
    return isCollegeVisible(user, collegeId);
  }
}
