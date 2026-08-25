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
 * 用于能否进监管看板；写操作仍须单独用角色校验。
 */
export function hasSchoolWideAccess(user: AuthUser) {
  return isSchoolAdminRole(user) || isSchoolViewerRole(user);
}

export function assertSchoolWideAccess(user: AuthUser, message?: string) {
  if (!hasSchoolWideAccess(user)) {
    throw new ForbiddenException(message || '仅校级管理员或校级查阅可访问');
  }
}

/**
 * 可见学院：
 * - 校级管理员 → ALL
 * - 校级查阅 + 分管列表为空 → ALL（校长/书记）
 * - 校级查阅 + 有分管 → 分管学院
 * - 学院用户 → 本院
 */
export function getVisibleCollegeIds(user: AuthUser): 'ALL' | string[] {
  if (isSchoolAdminRole(user)) return 'ALL';
  if (isSchoolViewerRole(user)) {
    const scopes = user.collegeScopeIds || [];
    return scopes.length === 0 ? 'ALL' : scopes;
  }
  if (user.collegeId) return [user.collegeId];
  return [];
}

/** Prisma where 片段：按可见学院过滤 collegeId 字段 */
export function prismaCollegeIdFilter(
  user: AuthUser,
): { collegeId?: string | { in: string[] } } {
  const v = getVisibleCollegeIds(user);
  if (v === 'ALL') return {};
  if (v.length === 0) return { collegeId: '__none__' };
  if (v.length === 1) return { collegeId: v[0] };
  return { collegeId: { in: v } };
}

export function isCollegeVisible(user: AuthUser, collegeId: string | null | undefined) {
  if (!collegeId) return false;
  const v = getVisibleCollegeIds(user);
  if (v === 'ALL') return true;
  return v.includes(collegeId);
}

export function assertCollegeVisible(
  user: AuthUser,
  collegeId: string | null | undefined,
  message?: string,
) {
  if (!isCollegeVisible(user, collegeId)) {
    throw new ForbiddenException(message || '无权查看该学院数据');
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

/** 议题库全量可见：书记/副书记/院长/副院长/学院管理员/会议秘书/校级 */
export const FULL_TOPIC_LIBRARY_ROLES = [
  RoleCode.SECRETARY,
  RoleCode.VICE_SECRETARY,
  RoleCode.DEAN,
  RoleCode.VICE_DEAN,
  RoleCode.COLLEGE_ADMIN,
  RoleCode.MEETING_SECRETARY,
  RoleCode.SCHOOL_ADMIN,
  RoleCode.SCHOOL_VIEWER,
] as const;

export function canSeeFullTopicLibrary(user: AuthUser) {
  if (user.isSchoolAdmin) return true;
  return hasAnyRole(user, [...FULL_TOPIC_LIBRARY_ROLES]);
}

/** 学院管理员/会议秘书可代审（须电话或当面确认并留痕） */
export const PROXY_REVIEW_ROLES = [
  RoleCode.COLLEGE_ADMIN,
  RoleCode.MEETING_SECRETARY,
] as const;
