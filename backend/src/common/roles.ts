import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './types';
import { RoleCode } from './constants';

export function hasAnyRole(user: AuthUser, roles: string[]) {
  if (user.isSchoolAdmin) return true;
  return roles.some((r) => user.roles?.includes(r));
}

export function assertAnyRole(user: AuthUser, roles: string[], message: string) {
  if (!hasAnyRole(user, roles)) {
    throw new ForbiddenException(message);
  }
}

/** 真正的校级管理员（含 isSchoolAdmin 标记） */
export function isSchoolAdminRole(user: AuthUser) {
  return !!(
    user.isSchoolAdmin || user.roles?.includes(RoleCode.SCHOOL_ADMIN)
  );
}

/** 校级查阅（组织部/宣传部/校领导只读） */
export function isSchoolViewerRole(user: AuthUser) {
  return !!user.roles?.includes(RoleCode.SCHOOL_VIEWER);
}

/**
 * 校级跨院访问范围：管理员或查阅角色。
 * 用于列表/详情的学院过滤；写操作仍须单独用角色校验，勿把查阅当超管。
 */
export function hasSchoolWideAccess(user: AuthUser) {
  return isSchoolAdminRole(user) || isSchoolViewerRole(user);
}

export function assertSchoolWideAccess(user: AuthUser, message?: string) {
  if (!hasSchoolWideAccess(user)) {
    throw new ForbiddenException(message || '仅校级管理员或校级查阅可访问');
  }
}

/** 会务操作：会议秘书 / 学院管理员 */
export const STAFF_ROLES = [
  RoleCode.MEETING_SECRETARY,
  RoleCode.COLLEGE_ADMIN,
  RoleCode.SCHOOL_ADMIN,
] as const;

/** 联席会联审 */
export const JOINT_REVIEWER_ROLES = [
  RoleCode.SECRETARY,
  RoleCode.DEAN,
] as const;

/** 党委审题 / 形成决议（仅书记） */
export const SECRETARY_ROLES = [RoleCode.SECRETARY] as const;

/** 党组织会议主持 / 散会（书记或副书记代主持） */
export const PARTY_HOST_ROLES = [
  RoleCode.SECRETARY,
  RoleCode.VICE_SECRETARY,
] as const;

/** 党组织会议纪要签署（书记或副书记） */
export const PARTY_MINUTES_SIGN_ROLES = [
  RoleCode.SECRETARY,
  RoleCode.VICE_SECRETARY,
] as const;

/** 纪要签署（联席会） */
export const MINUTES_SIGN_ROLES = [
  RoleCode.SECRETARY,
  RoleCode.DEAN,
] as const;
