import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthUser, JwtPayload } from '../common/types';
import { RoleCode } from '../common/constants';
import {
  assertPasswordPolicy,
  hashPassword,
  loginLockMinutes,
  loginMaxFailures,
} from '../common/password-policy';

type AuthUserRow = {
  id: string;
  username: string;
  realName: string;
  title: string | null;
  collegeId: string | null;
  isSchoolAdmin: boolean;
  tokenVersion: number;
  mustChangePassword: boolean;
  college: { name: string } | null;
  roles: { role: { code: string } }[];
  collegeScopes: { collegeId: string }[];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(
    dto: LoginDto,
    meta: { ip?: string; userAgent?: string } = {},
  ) {
    const username = dto.username.trim();
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        roles: { include: { role: true } },
        college: true,
        collegeScopes: { select: { collegeId: true } },
      },
    });

    const fail = async (message: string, resourceId?: string) => {
      await this.audit.log({
        user: null,
        action: 'LOGIN_FAIL',
        resource: 'User',
        resourceId,
        detail: { username, reason: message, ua: meta.userAgent },
        ip: meta.ip,
      });
      throw new UnauthorizedException(message);
    };

    if (!user) {
      await fail('用户名或密码错误');
    }

    if (user!.lockedUntil && user!.lockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil(
        (user!.lockedUntil.getTime() - Date.now()) / 60000,
      );
      await fail(`账号已锁定，请 ${mins} 分钟后再试`, user!.id);
    }

    if (!user!.enabled) {
      await fail('账号已禁用，请联系学院管理员', user!.id);
    }

    const ok = await bcrypt.compare(dto.password, user!.passwordHash);
    if (!ok) {
      const max = loginMaxFailures();
      const nextCount = (user!.failedLoginCount || 0) + 1;
      const lockMins = loginLockMinutes();
      const data: {
        failedLoginCount: number;
        lockedUntil?: Date | null;
      } = { failedLoginCount: nextCount };
      if (nextCount >= max) {
        data.lockedUntil = new Date(Date.now() + lockMins * 60 * 1000);
        data.failedLoginCount = 0;
      }
      await this.prisma.user.update({ where: { id: user!.id }, data });
      if (data.lockedUntil) {
        await fail(
          `连续失败过多，账号已锁定 ${lockMins} 分钟`,
          user!.id,
        );
      }
      await fail('用户名或密码错误', user!.id);
    }

    await this.prisma.user.update({
      where: { id: user!.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    return this.buildAuthResponse(user!, meta, 'LOGIN');
  }

  /** 注册页学院下拉（仅公开 id/名称/编码） */
  listColleges() {
    return this.prisma.college.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });
  }

  async register(
    dto: RegisterDto,
    meta: { ip?: string; userAgent?: string } = {},
  ) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('两次输入的密码不一致');
    }
    assertPasswordPolicy(dto.password);

    const college = await this.prisma.college.findUnique({
      where: { id: dto.collegeId },
    });
    if (!college) throw new BadRequestException('学院不存在');

    const exists = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (exists) throw new BadRequestException('用户名已存在');

    const attendee = await this.prisma.role.findUnique({
      where: { code: RoleCode.ATTENDEE },
    });
    if (!attendee) {
      throw new BadRequestException('系统角色未初始化，请联系管理员');
    }

    const passwordHash = await hashPassword(dto.password);
    let created;
    try {
      created = await this.prisma.user.create({
        data: {
          username: dto.username,
          passwordHash,
          realName: dto.realName,
          title: dto.title || null,
          collegeId: college.id,
          isSchoolAdmin: false,
          enabled: true,
          mustChangePassword: false,
          roles: { create: [{ roleId: attendee.id }] },
        },
        include: {
          roles: { include: { role: true } },
          college: true,
          collegeScopes: { select: { collegeId: true } },
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('用户名已存在');
      }
      throw e;
    }

    return this.buildAuthResponse(created, meta, 'REGISTER');
  }

  async me(user: AuthUser) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      include: {
        roles: { include: { role: true } },
        college: true,
        collegeScopes: { select: { collegeId: true } },
      },
    });
    if (!dbUser) throw new UnauthorizedException();
    return {
      id: dbUser.id,
      username: dbUser.username,
      realName: dbUser.realName,
      title: dbUser.title,
      collegeId: dbUser.collegeId,
      collegeName: dbUser.college?.name ?? null,
      isSchoolAdmin: dbUser.isSchoolAdmin,
      roles: dbUser.roles.map((r) => r.role.code),
      collegeScopeIds: dbUser.collegeScopes.map((s) => s.collegeId),
      mustChangePassword: dbUser.mustChangePassword,
    };
  }

  async changePassword(
    user: AuthUser,
    dto: ChangePasswordDto,
    meta: { ip?: string } = {},
  ) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });
    if (!dbUser) throw new UnauthorizedException();

    const ok = await bcrypt.compare(dto.oldPassword, dbUser.passwordHash);
    if (!ok) {
      throw new BadRequestException('当前密码不正确');
    }
    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }
    assertPasswordPolicy(dto.newPassword);
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: dbUser.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    const updated = await this.prisma.user.findUnique({
      where: { id: dbUser.id },
      include: {
        roles: { include: { role: true } },
        college: true,
        collegeScopes: { select: { collegeId: true } },
      },
    });
    if (!updated) throw new UnauthorizedException();

    const roles = updated.roles.map((r) => r.role.code);
    const collegeScopeIds = updated.collegeScopes.map((s) => s.collegeId);
    const payload: JwtPayload = {
      sub: updated.id,
      username: updated.username,
      collegeId: updated.collegeId,
      isSchoolAdmin: updated.isSchoolAdmin,
      roles,
      tv: updated.tokenVersion,
    };
    const accessToken = await this.jwt.signAsync(payload);

    await this.audit.log({
      user: {
        ...payload,
        realName: updated.realName,
        collegeScopeIds,
      },
      action: 'CHANGE_PASSWORD',
      resource: 'User',
      resourceId: updated.id,
      ip: meta.ip,
    });

    return {
      accessToken,
      user: {
        id: updated.id,
        username: updated.username,
        realName: updated.realName,
        title: updated.title,
        collegeId: updated.collegeId,
        collegeName: updated.college?.name ?? null,
        isSchoolAdmin: updated.isSchoolAdmin,
        roles,
        collegeScopeIds,
        mustChangePassword: false,
      },
    };
  }

  /** 登出：递增 tokenVersion，使当前 JWT 失效 */
  async logout(user: AuthUser, meta: { ip?: string } = {}) {
    await this.prisma.user.update({
      where: { id: user.sub },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.audit.log({
      user,
      action: 'LOGOUT',
      resource: 'User',
      resourceId: user.sub,
      ip: meta.ip,
    });
    return { ok: true };
  }

  private async buildAuthResponse(
    user: AuthUserRow,
    meta: { ip?: string; userAgent?: string },
    action: 'LOGIN' | 'REGISTER',
  ) {
    const roles = user.roles.map((r) => r.role.code);
    const collegeScopeIds = user.collegeScopes.map((s) => s.collegeId);
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      collegeId: user.collegeId,
      isSchoolAdmin: user.isSchoolAdmin,
      roles,
      tv: user.tokenVersion,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const authUser: AuthUser = {
      ...payload,
      realName: user.realName,
      collegeScopeIds,
      mustChangePassword: user.mustChangePassword,
    };
    await this.audit.log({
      user: authUser,
      action,
      resource: 'User',
      resourceId: user.id,
      ip: meta.ip,
      detail: { ua: meta.userAgent, collegeId: user.collegeId },
    });
    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        title: user.title,
        collegeId: user.collegeId,
        collegeName: user.college?.name ?? null,
        isSchoolAdmin: user.isSchoolAdmin,
        roles,
        collegeScopeIds,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}
