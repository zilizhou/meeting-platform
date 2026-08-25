import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { isCollegeVisible, prismaCollegeIdFilter } from '../common/roles';
import { getRequestContext } from '../common/request-context';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 追加一条审计。ip/ua 优先用显式入参，否则取请求上下文。
   * 审计表只允许 create；update/delete 由 Prisma 中间件与 DB 触发器拦截。
   */
  async log(params: {
    user?: AuthUser | null;
    action: string;
    resource: string;
    resourceId?: string;
    detail?: unknown;
    ip?: string;
    userAgent?: string;
  }) {
    const ctx = getRequestContext();
    const ip = params.ip || ctx.ip || undefined;
    const userAgent = params.userAgent || ctx.userAgent || undefined;

    let detail: string | null = null;
    if (params.detail !== undefined && params.detail !== null) {
      detail =
        typeof params.detail === 'string'
          ? params.detail
          : JSON.stringify(params.detail);
    }

    await this.prisma.auditLog.create({
      data: {
        collegeId: params.user?.collegeId ?? null,
        userId: params.user?.sub ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        detail,
        ip: ip ?? null,
        userAgent: userAgent || null,
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
      /** ISO 日期；不传则不按时间截断（全量最近 N 条） */
      since?: string;
    } = {},
  ) {
    const take = Math.min(query.take || 100, 200);
    let collegeFilter: { collegeId?: string | { in: string[] } } = {};
    if (query.collegeId) {
      collegeFilter = isCollegeVisible(user, query.collegeId)
        ? { collegeId: query.collegeId }
        : { collegeId: '__none__' };
    } else {
      collegeFilter = prismaCollegeIdFilter(user);
    }

    const sinceDate = query.since ? new Date(query.since) : undefined;
    const createdAt =
      sinceDate && !Number.isNaN(sinceDate.getTime())
        ? { gte: sinceDate }
        : undefined;

    return this.prisma.auditLog.findMany({
      where: {
        ...collegeFilter,
        ...(query.resource ? { resource: query.resource } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: {
        user: { select: { id: true, realName: true, username: true, title: true } },
        college: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** 留存天数（配置项；不做自动清理，仅运维说明与策略查询） */
  retentionDays(): number {
    const n = Number(process.env.AUDIT_RETENTION_DAYS || 180);
    return Number.isFinite(n) && n >= 30 ? n : 180;
  }

  policy() {
    return {
      appendOnly: true,
      retentionDays: this.retentionDays(),
      note: '审计日志只追加、禁止改删；保留不少于 6 个月，到期归档后可按制度离线留存，系统内不提供一键清空。',
    };
  }
}
