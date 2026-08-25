import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export const BCRYPT_ROUNDS = 10;

/** 演示环境可设 ALLOW_WEAK_PASSWORD=1，允许短口令/123456 */
export function allowWeakPassword(): boolean {
  return (
    process.env.ALLOW_WEAK_PASSWORD === '1' ||
    process.env.ALLOW_WEAK_PASSWORD === 'true'
  );
}

export function passwordMinLength(): number {
  const n = Number(process.env.PASSWORD_MIN_LENGTH || 10);
  return Number.isFinite(n) && n >= 6 ? n : 10;
}

export function loginMaxFailures(): number {
  const n = Number(process.env.LOGIN_MAX_FAILURES || 5);
  return Number.isFinite(n) && n >= 1 ? n : 5;
}

export function loginLockMinutes(): number {
  const n = Number(process.env.LOGIN_LOCK_MINUTES || 30);
  return Number.isFinite(n) && n >= 1 ? n : 30;
}

export function jwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '8h';
}

export function jwtSecretOrThrow(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('生产环境必须配置 JWT_SECRET');
  }
  return secret || 'qfnu-meeting-dev-secret-change-me';
}

/** 强口令：长度 + 大小写 + 数字 + 特殊字符 */
export function assertPasswordPolicy(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new BadRequestException('请设置密码');
  }
  if (allowWeakPassword()) {
    if (password.length < 4) {
      throw new BadRequestException('密码至少 4 位');
    }
    return;
  }
  const min = passwordMinLength();
  if (password.length < min) {
    throw new BadRequestException(`密码至少 ${min} 位`);
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    throw new BadRequestException('密码须同时包含大写与小写字母');
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestException('密码须包含数字');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new BadRequestException('密码须包含特殊字符');
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** 生成符合策略的临时口令（含大小写数字与特殊字符） */
export function generateTempPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  const pick = (chars: string) => chars[randomBytes(1)[0] % chars.length];
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  while (required.length < length) {
    required.push(pick(all));
  }
  // shuffle
  for (let i = required.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    const tmp = required[i];
    required[i] = required[j];
    required[j] = tmp;
  }
  return required.join('');
}

/**
 * 解析创建/重置用的初始口令。
 * - 传入 password：校验策略后使用，并建议 mustChange=true
 * - 未传入：弱口令模式用 123456；否则生成临时口令
 */
export function resolveInitialPassword(password?: string | null): {
  password: string;
  mustChangePassword: boolean;
} {
  if (password && password.trim()) {
    const p = password.trim();
    assertPasswordPolicy(p);
    return { password: p, mustChangePassword: true };
  }
  if (allowWeakPassword()) {
    return { password: '123456', mustChangePassword: true };
  }
  return {
    password: generateTempPassword(12),
    mustChangePassword: true,
  };
}
