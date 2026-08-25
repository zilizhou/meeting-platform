import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { AuthUser } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** 即使 mustChangePassword=true 也允许访问（改密、me、logout） */
export const ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY = 'allowWhenMustChangePassword';
export const AllowWhenMustChangePassword = () =>
  SetMetadata(ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
