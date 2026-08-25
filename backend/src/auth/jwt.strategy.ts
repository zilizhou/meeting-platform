import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from '../common/types';
import { jwtSecretOrThrow } from '../common/password-policy';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    _config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecretOrThrow(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: true } },
        collegeScopes: { select: { collegeId: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('账号不存在或已删除');
    }
    if (!user.enabled) {
      throw new UnauthorizedException('账号已禁用');
    }
    const tv = payload.tv ?? 0;
    if (tv !== user.tokenVersion) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    return {
      sub: user.id,
      username: user.username,
      realName: user.realName,
      collegeId: user.collegeId,
      isSchoolAdmin: user.isSchoolAdmin,
      roles: user.roles.map((r) => r.role.code),
      collegeScopeIds: user.collegeScopes.map((s) => s.collegeId),
      mustChangePassword: user.mustChangePassword,
      tv: user.tokenVersion,
    };
  }
}
