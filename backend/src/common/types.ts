export interface JwtPayload {
  sub: string;
  username: string;
  collegeId?: string | null;
  isSchoolAdmin: boolean;
  roles: string[];
}

export interface AuthUser extends JwtPayload {
  realName: string;
  /** 校级查阅分管学院；空数组表示全校 */
  collegeScopeIds: string[];
}
