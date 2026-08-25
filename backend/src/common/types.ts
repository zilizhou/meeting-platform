export interface JwtPayload {
  sub: string;
  username: string;
  collegeId?: string | null;
  isSchoolAdmin: boolean;
  roles: string[];
  /** 与 User.tokenVersion 对齐，不一致则令牌失效 */
  tv?: number;
}

export interface AuthUser extends JwtPayload {
  realName: string;
  /** 校级查阅分管学院；空数组表示全校 */
  collegeScopeIds: string[];
  mustChangePassword?: boolean;
}
