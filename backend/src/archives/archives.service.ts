import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { MeetingStatus } from '../common/constants';
import { hasSchoolWideAccess } from '../common/roles';

@Injectable()
export class ArchivesService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    user: AuthUser,
    query: {
      q?: string;
      meetingType?: string;
      isMajor?: boolean;
      isPublic?: boolean;
      year?: number;
      status?: string;
    },
  ) {
    const collegeFilter = hasSchoolWideAccess(user)
      ? {}
      : { collegeId: user.collegeId ?? '__none__' };

    const yearStart =
      query.year && Number.isFinite(query.year)
        ? new Date(`${query.year}-01-01T00:00:00.000Z`)
        : undefined;
    const yearEnd =
      query.year && Number.isFinite(query.year)
        ? new Date(`${query.year + 1}-01-01T00:00:00.000Z`)
        : undefined;

    const meetings = await this.prisma.meeting.findMany({
      where: {
        ...collegeFilter,
        status: query.status
          ? query.status
          : { in: [MeetingStatus.RESOLVED, MeetingStatus.ARCHIVED] },
        ...(query.meetingType ? { meetingType: query.meetingType } : {}),
        ...(query.isMajor !== undefined ? { isMajor: query.isMajor } : {}),
        ...(yearStart && yearEnd
          ? { createdAt: { gte: yearStart, lt: yearEnd } }
          : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q } },
                { periodNo: { contains: query.q } },
                { topics: { some: { title: { contains: query.q } } } },
              ],
            }
          : {}),
        ...(query.isPublic !== undefined
          ? {
              topics: {
                some: {
                  resolution: { isPublic: query.isPublic },
                },
              },
            }
          : {}),
      },
      include: {
        college: { select: { id: true, name: true, code: true } },
        minutes: { select: { id: true, effectiveAt: true, version: true } },
        topics: {
          include: {
            category: { select: { id: true, code: true, name: true } },
            resolution: {
              select: {
                id: true,
                resultType: true,
                isPublic: true,
                securityLevel: true,
                content: true,
              },
            },
          },
        },
        _count: { select: { attendances: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return meetings.map((m) => ({
      id: m.id,
      title: m.title,
      periodNo: m.periodNo,
      meetingType: m.meetingType,
      status: m.status,
      isMajor: m.isMajor,
      college: m.college,
      createdAt: m.createdAt,
      scheduledAt: m.scheduledAt,
      minutesEffectiveAt: m.minutes?.effectiveAt ?? null,
      topicCount: m.topics.length,
      attendanceCount: m._count.attendances,
      majorTopicCount: m.topics.filter((t) => t.isMajor).length,
      publicResolutionCount: m.topics.filter((t) => t.resolution?.isPublic)
        .length,
      topics: m.topics.map((t) => ({
        id: t.id,
        title: t.title,
        isMajor: t.isMajor,
        isEmergency: t.isEmergency,
        category: t.category,
        resolution: t.resolution,
      })),
    }));
  }

  /** 会议全宗：材料/签到/表决/纪要/督办一次性绑定 */
  async dossier(user: AuthUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        college: { select: { id: true, name: true, code: true } },
        attendances: {
          include: {
            user: { select: { id: true, realName: true, title: true } },
          },
        },
        minutes: { include: { signs: true } },
        topics: {
          include: {
            category: true,
            materials: {
              select: {
                id: true,
                name: true,
                uploaded: true,
                originalName: true,
                isRequired: true,
                securityLevel: true,
              },
            },
            votes: true,
            discussions: true,
            resolution: {
              include: {
                supervisionTasks: {
                  include: {
                    owner: { select: { id: true, realName: true } },
                    feedbacks: true,
                  },
                },
              },
            },
            jointReviews: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!meeting) throw new NotFoundException('会议不存在');
    if (!hasSchoolWideAccess(user) && meeting.collegeId !== user.collegeId) {
      throw new ForbiddenException();
    }
    return meeting;
  }
}
