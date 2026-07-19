export interface JwtPayload {
  sub: string;
  username: string;
  collegeId?: string | null;
  isSchoolAdmin: boolean;
  roles: string[];
}

export interface AuthUser extends JwtPayload {
  realName: string;
}
