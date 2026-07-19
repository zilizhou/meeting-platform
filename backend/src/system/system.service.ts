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
import { AuditService } from '../audit/audit.service';
import {
  CreateCategoryDto,
  CreateCollegeDto,
  CreateSystemUserDto,
  UpdateCategoryDto,
  UpdateCollegeDto,
} from './dto/system.dto';

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertSchoolAdmin(user: AuthUser) {
    if (!user.isSchoolAdmin) {
      throw new ForbiddenException('仅校级管理员可进行系统管理');
    }
  }

  async listColleges(user: AuthUser) {
    this.assertSchoolAdmin(user);
    const colleges = await this.prisma.college.findMany({
      orderBy: { code: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            topics: true,
            meetings: true,
          },
        },
      },
    });
    return colleges.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      createdAt: c.createdAt,
      userCount: c._count.users,
      topicCount: c._count.topics,
      meetingCount: c._count.meetings,
    }));
  }

  /** 系统内部唯一编码，创建时自动生成，不要求用户填写 */
  private async nextCollegeCode() {
    for (let i = 0; i < 8; i++) {
      const code = `C${Date.now().toString(36).toUpperCase()}${i || ''}`;
      const exists = await this.prisma.college.findUnique({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException('生成学院编码失败，请重试');
  }

  async createCollege(user: AuthUser, dto: CreateCollegeDto) {
    this.assertSchoolAdmin(user);
    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('学院名称至少 2 个字');

    const code = await this.nextCollegeCode();
    const college = await this.prisma.college.create({
      data: { code, name },
    });
    await this.audit.log({
      user,
      action: 'CREATE',
      resource: 'College',
      resourceId: college.id,
      detail: { code, name },
    });
    return college;
  }

  async updateCollege(user: AuthUser, id: string, dto: UpdateCollegeDto) {
    this.assertSchoolAdmin(user);
    const existing = await this.prisma.college.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('学院不存在');

    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('学院名称至少 2 个字');

    const college = await this.prisma.college.update({
      where: { id },
      data: { name },
    });
    await this.audit.log({
      user,
      action: 'UPDATE',
      resource: 'College',
      resourceId: id,
      detail: { name },
    });
    return college;
  }

  async deleteCollege(user: AuthUser, id: string) {
    this.assertSchoolAdmin(user);
    const existing = await this.prisma.college.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true, topics: true, meetings: true },
        },
      },
    });
    if (!existing) throw new NotFoundException('学院不存在');

    const { users, topics, meetings } = existing._count;
    if (users > 0 || topics > 0 || meetings > 0) {
      throw new BadRequestException(
        `学院「${existing.name}」仍有业务数据（用户 ${users} / 议题 ${topics} / 会议 ${meetings}），禁止删除`,
      );
    }

    await this.prisma.college.delete({ where: { id } });
    await this.audit.log({
      user,
      action: 'DELETE',
      resource: 'College',
      resourceId: id,
      detail: { code: existing.code, name: existing.name },
    });
    return { ok: true };
  }

  async listCategories(
    user: AuthUser,
    meetingType?: string,
    scope?: 'school' | 'college' | 'all',
  ) {
    this.assertSchoolAdmin(user);
    const where: Record<string, unknown> = {};
    if (meetingType) where.meetingType = meetingType;
    if (scope === 'school') where.collegeId = null;
    if (scope === 'college') where.collegeId = { not: null };

    const rows = await this.prisma.categoryDict.findMany({
      where,
      include: {
        college: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ meetingType: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows;
  }

  async createCategory(user: AuthUser, dto: CreateCategoryDto) {
    this.assertSchoolAdmin(user);
    const meetingType = dto.meetingType.trim();
    if (
      meetingType !== MeetingType.JOINT_CONFERENCE &&
      meetingType !== MeetingType.PARTY_COMMITTEE
    ) {
      throw new BadRequestException('meetingType 无效');
    }

    let collegeId: string | null = null;
    if (dto.collegeId) {
      const college = await this.prisma.college.findUnique({
        where: { id: dto.collegeId },
      });
      if (!college) throw new BadRequestException('学院不存在');
      collegeId = college.id;
    }

    const code = dto.code.trim().toUpperCase();
    const dup = await this.prisma.categoryDict.findFirst({
      where: { collegeId, meetingType, code },
    });
    if (dup) {
      throw new BadRequestException(
        `分类编码 ${code} 在该范围下已存在`,
      );
    }

    const row = await this.prisma.categoryDict.create({
      data: {
        collegeId,
        meetingType,
        code,
        name: dto.name.trim(),
        needPrecheck: dto.needPrecheck ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        college: { select: { id: true, name: true, code: true } },
      },
    });

    await this.audit.log({
      user,
      action: 'CREATE',
      resource: 'CategoryDict',
      resourceId: row.id,
      detail: dto,
    });
    return row;
  }

  async updateCategory(user: AuthUser, id: string, dto: UpdateCategoryDto) {
    this.assertSchoolAdmin(user);
    const existing = await this.prisma.categoryDict.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('分类不存在');

    const row = await this.prisma.categoryDict.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.needPrecheck !== undefined
          ? { needPrecheck: dto.needPrecheck }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: {
        college: { select: { id: true, name: true, code: true } },
      },
    });

    await this.audit.log({
      user,
      action: 'UPDATE',
      resource: 'CategoryDict',
      resourceId: id,
      detail: dto,
    });
    return row;
  }

  async deleteCategory(user: AuthUser, id: string) {
    this.assertSchoolAdmin(user);
    const existing = await this.prisma.categoryDict.findUnique({
      where: { id },
      include: { _count: { select: { topics: true } } },
    });
    if (!existing) throw new NotFoundException('分类不存在');
    if (existing._count.topics > 0) {
      throw new BadRequestException(
        `分类「${existing.name}」已被 ${existing._count.topics} 个议题引用，禁止删除`,
      );
    }

    await this.prisma.categoryDict.delete({ where: { id } });
    await this.audit.log({
      user,
      action: 'DELETE',
      resource: 'CategoryDict',
      resourceId: id,
      detail: {
        code: existing.code,
        name: existing.name,
        meetingType: existing.meetingType,
      },
    });
    return { ok: true };
  }

  /** 系统管理：创建学院用户、校级管理员或校级查阅 */
  async createUser(user: AuthUser, dto: CreateSystemUserDto) {
    this.assertSchoolAdmin(user);

    const roleCodes = dto.roleCodes?.length
      ? [...new Set(dto.roleCodes)]
      : dto.isSchoolAdmin
        ? [RoleCode.SCHOOL_ADMIN]
        : [RoleCode.ATTENDEE];

    const wantSchoolAdmin =
      dto.isSchoolAdmin === true ||
      roleCodes.includes(RoleCode.SCHOOL_ADMIN);

    const wantSchoolViewer =
      !wantSchoolAdmin && roleCodes.includes(RoleCode.SCHOOL_VIEWER);

    if (wantSchoolAdmin) {
      if (dto.collegeId) {
        throw new BadRequestException('校级管理员账号不应绑定学院');
      }
      const exists = await this.prisma.user.findUnique({
        where: { username: dto.username.trim() },
      });
      if (exists) throw new BadRequestException('用户名已存在');

      const role = await this.prisma.role.findUnique({
        where: { code: RoleCode.SCHOOL_ADMIN },
      });
      if (!role) throw new BadRequestException('SCHOOL_ADMIN 角色未初始化');

      const password = dto.password || '123456';
      const passwordHash = await bcrypt.hash(password, 8);
      const created = await this.prisma.user.create({
        data: {
          username: dto.username.trim(),
          passwordHash,
          realName: dto.realName.trim(),
          title: dto.title?.trim() || '校级管理员',
          collegeId: null,
          isSchoolAdmin: true,
          enabled: true,
          roles: { create: [{ roleId: role.id }] },
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
        detail: { username: created.username, isSchoolAdmin: true },
      });

      return {
        id: created.id,
        username: created.username,
        realName: created.realName,
        title: created.title,
        collegeId: null,
        college: null,
        isSchoolAdmin: true,
        enabled: true,
        createdAt: created.createdAt,
        roles: created.roles.map((r) => ({
          code: r.role.code,
          name: r.role.name,
        })),
        roleCodes: created.roles.map((r) => r.role.code),
      };
    }

    if (wantSchoolViewer) {
      if (dto.collegeId) {
        throw new BadRequestException('校级查阅账号不应绑定学院');
      }
      const exists = await this.prisma.user.findUnique({
        where: { username: dto.username.trim() },
      });
      if (exists) throw new BadRequestException('用户名已存在');

      const role = await this.prisma.role.findUnique({
        where: { code: RoleCode.SCHOOL_VIEWER },
      });
      if (!role) throw new BadRequestException('SCHOOL_VIEWER 角色未初始化');

      const password = dto.password || '123456';
      const passwordHash = await bcrypt.hash(password, 8);
      const created = await this.prisma.user.create({
        data: {
          username: dto.username.trim(),
          passwordHash,
          realName: dto.realName.trim(),
          title: dto.title?.trim() || '校级查阅',
          collegeId: null,
          isSchoolAdmin: false,
          enabled: true,
          roles: { create: [{ roleId: role.id }] },
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
        detail: {
          username: created.username,
          roleCodes: [RoleCode.SCHOOL_VIEWER],
        },
      });

      return {
        id: created.id,
        username: created.username,
        realName: created.realName,
        title: created.title,
        collegeId: null,
        college: null,
        isSchoolAdmin: false,
        enabled: true,
        createdAt: created.createdAt,
        roles: created.roles.map((r) => ({
          code: r.role.code,
          name: r.role.name,
        })),
        roleCodes: created.roles.map((r) => r.role.code),
      };
    }

    if (!dto.collegeId) {
      throw new BadRequestException('创建学院用户时须指定 collegeId');
    }
    const college = await this.prisma.college.findUnique({
      where: { id: dto.collegeId },
    });
    if (!college) throw new BadRequestException('学院不存在');

    for (const code of roleCodes) {
      if (
        code === RoleCode.SCHOOL_ADMIN ||
        code === RoleCode.SCHOOL_VIEWER
      ) {
        throw new BadRequestException(
          '学院用户不可分配校级角色（SCHOOL_ADMIN / SCHOOL_VIEWER）',
        );
      }
    }

    const roles = await this.prisma.role.findMany({
      where: { code: { in: roleCodes } },
    });
    if (roles.length !== roleCodes.length) {
      throw new BadRequestException('存在无效角色编码');
    }

    const exists = await this.prisma.user.findUnique({
      where: { username: dto.username.trim() },
    });
    if (exists) throw new BadRequestException('用户名已存在');

    const password = dto.password || '123456';
    const passwordHash = await bcrypt.hash(password, 8);
    const created = await this.prisma.user.create({
      data: {
        username: dto.username.trim(),
        passwordHash,
        realName: dto.realName.trim(),
        title: dto.title?.trim() || null,
        collegeId: dto.collegeId,
        isSchoolAdmin: false,
        enabled: true,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
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
      detail: { username: created.username, roleCodes, collegeId: dto.collegeId },
    });

    return {
      id: created.id,
      username: created.username,
      realName: created.realName,
      title: created.title,
      collegeId: created.collegeId,
      college: created.college,
      isSchoolAdmin: false,
      enabled: true,
      createdAt: created.createdAt,
      roles: created.roles.map((r) => ({
        code: r.role.code,
        name: r.role.name,
      })),
      roleCodes: created.roles.map((r) => r.role.code),
    };
  }
}
