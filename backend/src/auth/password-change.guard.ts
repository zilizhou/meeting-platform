import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY,
  IS_PUBLIC_KEY,
} from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';

@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allow = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allow) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user?.sub) return true;

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { mustChangePassword: true },
    });
    if (dbUser?.mustChangePassword) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: '首次登录或密码已重置，请先修改密码',
      });
    }
    return true;
  }
}
