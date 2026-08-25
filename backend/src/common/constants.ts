/** 业务常量：与 Prisma 字符串字段对应 */
export const MeetingType = {
  PARTY_COMMITTEE: 'PARTY_COMMITTEE',
  JOINT_CONFERENCE: 'JOINT_CONFERENCE',
} as const;

export const MeetingStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  /** 会中已散会，待纪要签署 */
  ENDED: 'ENDED',
  RESOLVED: 'RESOLVED',
  ARCHIVED: 'ARCHIVED',
} as const;

export const TopicStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  DEFERRED: 'DEFERRED',
  APPROVED: 'APPROVED',
  ON_AGENDA: 'ON_AGENDA',
  DISCUSSED: 'DISCUSSED',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED',
} as const;

export const JointReviewSide = {
  SECRETARY: 'SECRETARY',
  DEAN: 'DEAN',
} as const;

export const ReviewDecision = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export const OpinionType = {
  AGREE: 'AGREE',
  DISAGREE: 'DISAGREE',
  DEFER: 'DEFER',
} as const;

export const VoteMethod = {
  ORAL: 'ORAL',
  HAND: 'HAND',
  BALLOT: 'BALLOT',
} as const;

export const ResolutionType = {
  APPROVED: 'APPROVED',
  PRINCIPLE_APPROVED: 'PRINCIPLE_APPROVED',
  DEFERRED: 'DEFERRED',
  REJECTED: 'REJECTED',
} as const;

export const SupervisionStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  FEEDBACK: 'FEEDBACK',
  DONE: 'DONE',
  OVERDUE: 'OVERDUE',
  ADJUST_REQUEST: 'ADJUST_REQUEST',
} as const;

export const RoleCode = {
  SCHOOL_ADMIN: 'SCHOOL_ADMIN',
  /** 校级查阅：组织部/宣传部/校领导只读监管，无系统管理权 */
  SCHOOL_VIEWER: 'SCHOOL_VIEWER',
  COLLEGE_ADMIN: 'COLLEGE_ADMIN',
  SECRETARY: 'SECRETARY',
  VICE_SECRETARY: 'VICE_SECRETARY',
  DEAN: 'DEAN',
  VICE_DEAN: 'VICE_DEAN',
  PARTY_MEMBER: 'PARTY_MEMBER',
  MEETING_SECRETARY: 'MEETING_SECRETARY',
  /** 部门负责人：可申报议题，可作为列席参加会议（无表决权） */
  DEPT_HEAD: 'DEPT_HEAD',
  ATTENDEE: 'ATTENDEE',
} as const;

/** 自助注册可选角色（不含校级管理员 / 校级查阅） */
export const REGISTERABLE_ROLE_CODES = [
  RoleCode.SECRETARY,
  RoleCode.VICE_SECRETARY,
  RoleCode.DEAN,
  RoleCode.VICE_DEAN,
  RoleCode.PARTY_MEMBER,
  RoleCode.MEETING_SECRETARY,
  RoleCode.COLLEGE_ADMIN,
  RoleCode.DEPT_HEAD,
  RoleCode.ATTENDEE,
] as const;
