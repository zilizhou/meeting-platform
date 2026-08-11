import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { AuthUser, JwtPayload } from '../common/types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: {
        roles: { include: { role: true } },
        college: true,
        collegeScopes: { select: { collegeId: true } },
      },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (!user.enabled) {
      throw new UnauthorizedException('账号已禁用，请联系学院管理员');
    }

    const roles = user.roles.map((r) => r.role.code);
    const collegeScopeIds = user.collegeScopes.map((s) => s.collegeId);
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      collegeId: user.collegeId,
      isSchoolAdmin: user.isSchoolAdmin,
      roles,
    };
    const accessToken = await this.jwt.signAsync(payload);
    await this.audit.log({
      user: {
        ...payload,
        realName: user.realName,
        collegeScopeIds,
      },
      action: 'LOGIN',
      resource: 'User',
      resourceId: user.id,
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
      },
    };
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
    };
  }
}
