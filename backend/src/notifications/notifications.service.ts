import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';

export interface NotifyPayload {
  userId: string;
  collegeId?: string | null;
  type: string;
  title: string;
  content?: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(payload: NotifyPayload) {
    return this.prisma.notification.create({
      data: {
        userId: payload.userId,
        collegeId: payload.collegeId ?? null,
        type: payload.type,
        title: payload.title,
        content: payload.content,
        link: payload.link,
      },
    });
  }

  async notifyMany(payloads: NotifyPayload[]) {
    if (!payloads.length) return { count: 0 };
    await this.prisma.notification.createMany({
      data: payloads.map((p) => ({
        userId: p.userId,
        collegeId: p.collegeId ?? null,
        type: p.type,
        title: p.title,
        content: p.content,
        link: p.link,
      })),
    });
    return { count: payloads.length };
  }

  async list(user: AuthUser, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId: user.sub,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async unreadCount(user: AuthUser) {
    const count = await this.prisma.notification.count({
      where: { userId: user.sub, readAt: null },
    });
    return { count };
  }

  async markRead(user: AuthUser, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, userId: user.sub },
    });
    if (!n) return { ok: false };
    await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
