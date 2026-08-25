import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  AllowWhenMustChangePassword,
  CurrentUser,
  Public,
} from '../common/decorators';
import { AuthUser } from '../common/types';

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  /** 登录比全局更严，抑制撞库（与账号锁定互补） */
  @Throttle({
    default: {
      limit: envInt('THROTTLE_LOGIN_LIMIT', 20),
      ttl: envInt('THROTTLE_LOGIN_TTL_MS', 60_000),
    },
  })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, {
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
    });
  }

  @Public()
  @Get('colleges')
  colleges() {
    return this.auth.listColleges();
  }

  @Public()
  @Throttle({
    default: {
      limit: envInt('THROTTLE_LOGIN_LIMIT', 20),
      ttl: envInt('THROTTLE_LOGIN_TTL_MS', 60_000),
    },
  })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, {
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
    });
  }

  @ApiBearerAuth()
  @AllowWhenMustChangePassword()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @ApiBearerAuth()
  @AllowWhenMustChangePassword()
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(user, dto, { ip: clientIp(req) });
  }

  @ApiBearerAuth()
  @AllowWhenMustChangePassword()
  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.logout(user, { ip: clientIp(req) });
  }
}

function clientIp(req: Request): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress;
}
