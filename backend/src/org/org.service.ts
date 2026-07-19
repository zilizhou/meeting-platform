import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { MeetingType, RoleCode } from '../common/constants';
import { UpdateRosterDto, UpsertRosterDto } from './dto/roster.dto';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';
import { AuditService } from '../audit/audit.service';

/** 学院可分配的角色（不含校级管理员） */
const COLLEGE_ASSIGNABLE_ROLES = new Set([
  RoleCode.COLLEGE_ADMIN,
  RoleCode.SECRETARY,
  RoleCode.VICE_SECRETARY,
  RoleCode.DEAN,
  RoleCode.VICE_DEAN,
  RoleCode.PARTY_MEMBER,
  RoleCode.MEETING_SECRETARY,
  RoleCode.DEPT_HEAD,
  RoleCode.ATTENDEE,
]);

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  assertCollegeAccess(user: AuthUser, collegeId: string) {
    if (user.isSchoolAdmin) return;
    if (user.collegeId !== collegeId) {
      throw new ForbiddenException('无权访问其他学院数据');
    }
  }

  assertRosterAdmin(user: AuthUser) {
    if (user.isSchoolAdmin) return;
    const ok =
      user.roles.includes(RoleCode.COLLEGE_ADMIN) ||
      user.roles.includes(RoleCode.MEETING_SECRETARY) ||
      user.roles.includes(RoleCode.SECRETARY);
    if (!ok) throw new ForbiddenException('仅学院管理员/会议秘书可维护名单');
  }

  /** 人员管理：学院管理员 / 书记 / 校级 */
  assertUserAdmin(user: AuthUser) {
    if (user.isSchoolAdmin) return;
    const ok =
      user.roles.includes(RoleCode.COLLEGE_ADMIN) ||
      user.roles.includes(RoleCode.SECRETARY);
    if (!ok) {
      throw new ForbiddenException('仅学院管理员或党委书记可管理本院人员');
    }
  }

  private async resolveRoleIds(roleCodes: string[]) {
    const unique = [...new Set(roleCodes)];
    for (const code of unique) {
      if (!COLLEGE_ASSIGNABLE_ROLES.has(code as any)) {
        throw new BadRequestException(
          `角色 ${code} 不可由学院分配（校级管理员由组织部配置）`,
        );
      }
    }
    const roles = await this.prisma.role.findMany({
      where: { code: { in: unique } },
    });
    if (roles.length !== unique.length) {
      const found = new Set(roles.map((r) => r.code));
      const missing = unique.filter((c) => !found.has(c));
      throw new BadRequestException(`角色不存在：${missing.join('、')}`);
    }
    return roles;
  }

  private toUserView(u: {
    id: string;
    username: string;
    realName: string;
    title: string | null;
    collegeId: string | null;
    isSchoolAdmin: boolean;
    enabled: boolean;
    createdAt: Date;
    college?: { id: string; name: string; code: string } | null;
    roles: { role: { id: string; code: string; name: string } }[];
  }) {
    return {
      id: u.id,
      username: u.username,
      realName: u.realName,
      title: u.title,
      collegeId: u.collegeId,
      college: u.college ?? null,
      isSchoolAdmin: u.isSchoolAdmin,
      enabled: u.enabled,
      createdAt: u.createdAt,
      roles: u.roles.map((r) => ({
        code: r.role.code,
        name: r.role.name,
      })),
      roleCodes: u.roles.map((r) => r.role.code),
    };
  }

  async listColleges(user: AuthUser) {
    if (user.isSchoolAdmin) {
      return this.prisma.college.findMany({ orderBy: { code: 'asc' } });
    }
    if (!user.collegeId) return [];
    return this.prisma.college.findMany({ where: { id: user.collegeId } });
  }

  async getRoster(user: AuthUser, collegeId: string, meetingType: string) {
    this.assertCollegeAccess(user, collegeId);
    return this.prisma.rosterMember.findMany({
      where: { collegeId, meetingType },
      include: {
        user: {
          select: { id: true, realName: true, title: true, username: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async upsertRoster(user: AuthUser, dto: UpsertRosterDto) {
    this.assertRosterAdmin(user);
    this.assertCollegeAccess(user, dto.collegeId);

    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!target) throw new NotFoundException('用户不存在');
    if (!target.enabled) {
      throw new BadRequestException('账号已禁用，不能加入参会名单');
    }
    if (target.collegeId && target.collegeId !== dto.collegeId) {
      throw new BadRequestException('只能将本院用户加入名单');
    }

    const member = await this.prisma.rosterMember.upsert({
      where: {
        collegeId_meetingType_userId: {
          collegeId: dto.collegeId,
          meetingType: dto.meetingType,
          userId: dto.userId,
        },
      },
      create: {
        collegeId: dto.collegeId,
        meetingType: dto.meetingType,
        userId: dto.userId,
        isFormal: dto.isFormal ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      update: {
        isFormal: dto.isFormal ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        user: {
          select: { id: true, realName: true, title: true, username: true },
        },
      },
    });

    await this.audit.log({
      user,
      action: 'ROSTER_UPSERT',
      resource: 'RosterMember',
      resourceId: member.id,
      detail: dto,
    });
    return member;
  }

  async updateRoster(user: AuthUser, id: string, dto: UpdateRosterDto) {
    this.assertRosterAdmin(user);
    const existing = await this.prisma.rosterMember.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('名单记录不存在');
    this.assertCollegeAccess(user, existing.collegeId);

    const member = await this.prisma.rosterMember.update({
      where: { id },
      data: {
        ...(dto.isFormal !== undefined ? { isFormal: dto.isFormal } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: {
        user: {
          select: { id: true, realName: true, title: true, username: true },
        },
      },
    });

    await this.audit.log({
      user,
      action: 'ROSTER_UPDATE',
      resource: 'RosterMember',
      resourceId: id,
      detail: dto,
    });
    return member;
  }

  async removeRoster(user: AuthUser, id: string) {
    this.assertRosterAdmin(user);
    const existing = await this.prisma.rosterMember.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('名单记录不存在');
    this.assertCollegeAccess(user, existing.collegeId);

    await this.prisma.rosterMember.delete({ where: { id } });
    await this.audit.log({
      user,
      action: 'ROSTER_REMOVE',
      resource: 'RosterMember',
      resourceId: id,
      detail: existing,
    });
    return { ok: true };
  }

  async listCategories(
    user: AuthUser,
    meetingType = MeetingType.JOINT_CONFERENCE,
  ) {
    return this.prisma.categoryDict.findMany({
      where: {
        meetingType,
        OR: [
          { collegeId: null },
          ...(user.collegeId ? [{ collegeId: user.collegeId }] : []),
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async listUsers(user: AuthUser, collegeId?: string) {
    // 校级可跨院；不传 collegeId 时校级看全校（不含纯校级账号可选）
    if (user.isSchoolAdmin) {
      const users = await this.prisma.user.findMany({
        where: collegeId
          ? { collegeId }
          : { OR: [{ collegeId: { not: null } }, { isSchoolAdmin: true }] },
        include: {
          college: { select: { id: true, name: true, code: true } },
          roles: { include: { role: true } },
        },
        orderBy: [{ collegeId: 'asc' }, { realName: 'asc' }],
      });
      return users.map((u) => this.toUserView(u));
    }

    const cid = collegeId || user.collegeId;
    if (!cid) throw new NotFoundException('未指定学院');
    this.assertCollegeAccess(user, cid);
    const users = await this.prisma.user.findMany({
      where: { collegeId: cid },
      include: {
        college: { select: { id: true, name: true, code: true } },
        roles: { include: { role: true } },
      },
      orderBy: { realName: 'asc' },
    });
    return users.map((u) => this.toUserView(u));
  }

  async listRoles(user: AuthUser) {
    // 学院侧只返回可分配角色；校级可见全部
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
    });
    if (user.isSchoolAdmin) return roles;
    return roles.filter((r) => COLLEGE_ASSIGNABLE_ROLES.has(r.code as any));
  }

  async createUser(user: AuthUser, dto: CreateUserDto) {
    this.assertUserAdmin(user);

    let collegeId = dto.collegeId;
    if (user.isSchoolAdmin) {
      if (!collegeId) {
        throw new BadRequestException('校级创建学院用户时须指定 collegeId');
      }
    } else {
      if (!user.collegeId) throw new ForbiddenException('当前账号未绑定学院');
      collegeId = user.collegeId;
      if (dto.collegeId && dto.collegeId !== user.collegeId) {
        throw new ForbiddenException('只能创建本院用户');
      }
    }

    const college = await this.prisma.college.findUnique({
      where: { id: collegeId },
    });
    if (!college) throw new BadRequestException('学院不存在');

    const exists = await this.prisma.user.findUnique({
      where: { username: dto.username.trim() },
    });
    if (exists) throw new BadRequestException('用户名已存在');

    const roleCodes = dto.roleCodes?.length
      ? dto.roleCodes
      : [RoleCode.ATTENDEE];
    const roles = await this.resolveRoleIds(roleCodes);
    const password = dto.password || '123456';
    const passwordHash = await bcrypt.hash(password, 8);

    const created = await this.prisma.user.create({
      data: {
        username: dto.username.trim(),
        passwordHash,
        realName: dto.realName.trim(),
        title: dto.title?.trim() || null,
        collegeId,
        isSchoolAdmin: false,
        enabled: true,
        roles: {
          create: roles.map((r) => ({ roleId: r.id })),
        },
      },
      include: {
        college: { select: { id: true, name: true, code: true } },
        roles: { include: { role: true } },
      },
    });

    await this.audit.log({
      user,
      action: 'CREATE',
      resource: 'User',
      resourceId: created.id,
      detail: { username: created.username, roleCodes, collegeId },
    });

    return this.toUserView(created);
  }

  /** 校级可管全校（含校级账号）；学院侧仅本院非校级账号 */
  private assertCanManageTarget(
    user: AuthUser,
    target: { id: string; collegeId: string | null; isSchoolAdmin: boolean },
  ) {
    if (target.isSchoolAdmin && !user.isSchoolAdmin) {
      throw new ForbiddenException('无权操作校级管理员');
    }
    if (target.collegeId) {
      this.assertCollegeAccess(user, target.collegeId);
      return;
    }
    if (!user.isSchoolAdmin) {
      throw new ForbiddenException('无权操作该账号');
    }
  }

  async updateUser(user: AuthUser, id: string, dto: UpdateUserDto) {
    this.assertUserAdmin(user);
    const target = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!target) throw new NotFoundException('用户不存在');
    this.assertCanManageTarget(user, target);

    if (id === user.sub && dto.enabled === false) {
      throw new BadRequestException('不能禁用自己的账号');
    }

    // 校级账号不允许改角色（固定 SCHOOL_ADMIN / SCHOOL_VIEWER）
    const targetIsSchoolViewer = await this.prisma.userRole.findFirst({
      where: {
        userId: id,
        role: { code: RoleCode.SCHOOL_VIEWER },
      },
    });
    if (dto.roleCodes && !target.isSchoolAdmin && !targetIsSchoolViewer) {
      const roles = await this.resolveRoleIds(dto.roleCodes);
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      await this.prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: id, roleId: r.id })),
      });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.realName !== undefined
          ? { realName: dto.realName.trim() }
          : {}),
        ...(dto.title !== undefined
          ? { title: dto.title?.trim() || null }
          : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
      include: {
        college: { select: { id: true, name: true, code: true } },
        roles: { include: { role: true } },
      },
    });

    await this.audit.log({
      user,
      action: 'UPDATE',
      resource: 'User',
      resourceId: id,
      detail: dto,
    });

    return this.toUserView(updated);
  }

  async resetPassword(user: AuthUser, id: string, dto: ResetPasswordDto) {
    this.assertUserAdmin(user);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');
    this.assertCanManageTarget(user, target);

    const passwordHash = await bcrypt.hash(dto.password, 8);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await this.audit.log({
      user,
      action: 'RESET_PASSWORD',
      resource: 'User',
      resourceId: id,
    });

    return { ok: true };
  }

  async setEnabled(user: AuthUser, id: string, enabled: boolean) {
    return this.updateUser(user, id, { enabled });
  }

  async deleteUser(user: AuthUser, id: string) {
    this.assertUserAdmin(user);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');
    if (id === user.sub) {
      throw new BadRequestException('不能删除自己的账号');
    }
    this.assertCanManageTarget(user, target);

    const [
      topics,
      reviews,
      attendances,
      discussions,
      votes,
      signs,
      ownedTasks,
      feedbacks,
    ] = await Promise.all([
      this.prisma.topic.count({ where: { proposerId: id } }),
      this.prisma.jointReview.count({ where: { reviewerId: id } }),
      this.prisma.attendance.count({ where: { userId: id } }),
      this.prisma.discussionOpinion.count({ where: { userId: id } }),
      this.prisma.voteRecord.count({ where: { userId: id } }),
      this.prisma.minutesSign.count({ where: { userId: id } }),
      this.prisma.supervisionTask.count({ where: { ownerId: id } }),
      this.prisma.supervisionFeedback.count({ where: { userId: id } }),
    ]);

    const bizCount =
      topics +
      reviews +
      attendances +
      discussions +
      votes +
      signs +
      ownedTasks +
      feedbacks;
    if (bizCount > 0) {
      throw new BadRequestException(
        '该用户已有业务数据（议题/审题/参会/表决/纪要/督办等），请改用「禁用」，不可删除',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.updateMany({
        where: { userId: id },
        data: { userId: null },
      });
      await tx.user.delete({ where: { id } });
    });

    await this.audit.log({
      user,
      action: 'DELETE',
      resource: 'User',
      resourceId: id,
      detail: {
        username: target.username,
        realName: target.realName,
        collegeId: target.collegeId,
      },
    });

    return { ok: true };
  }
}
