import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { hasSchoolWideAccess } from '../common/roles';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    user?: AuthUser | null;
    action: string;
    resource: string;
    resourceId?: string;
    detail?: unknown;
    ip?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        collegeId: params.user?.collegeId ?? null,
        userId: params.user?.sub ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        detail:
          params.detail === undefined
            ? null
            : typeof params.detail === 'string'
              ? params.detail
              : JSON.stringify(params.detail),
        ip: params.ip,
      },
    });
  }

  async list(
    user: AuthUser,
    query: {
      resource?: string;
      resourceId?: string;
      action?: string;
      collegeId?: string;
      take?: number;
    } = {},
  ) {
    const take = Math.min(query.take || 100, 200);
    const collegeFilter = hasSchoolWideAccess(user)
      ? query.collegeId
        ? { collegeId: query.collegeId }
        : {}
      : { collegeId: user.collegeId ?? '__none__' };

    return this.prisma.auditLog.findMany({
      where: {
        ...collegeFilter,
        ...(query.resource ? { resource: query.resource } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.action ? { action: query.action } : {}),
      },
      include: {
        user: { select: { id: true, realName: true, username: true, title: true } },
        college: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
