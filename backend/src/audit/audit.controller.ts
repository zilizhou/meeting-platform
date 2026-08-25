import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { RoleCode } from '../common/constants';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('policy')
  @Roles(
    RoleCode.SCHOOL_ADMIN,
    RoleCode.SCHOOL_VIEWER,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.MEETING_SECRETARY,
    RoleCode.SECRETARY,
    RoleCode.DEAN,
  )
  policy() {
    return this.audit.policy();
  }

  @Get('logs')
  @Roles(
    RoleCode.SCHOOL_ADMIN,
    RoleCode.SCHOOL_VIEWER,
    RoleCode.COLLEGE_ADMIN,
    RoleCode.MEETING_SECRETARY,
    RoleCode.SECRETARY,
    RoleCode.DEAN,
  )
  logs(
    @CurrentUser() user: AuthUser,
    @Query('resource') resource?: string,
    @Query('resourceId') resourceId?: string,
    @Query('action') action?: string,
    @Query('collegeId') collegeId?: string,
    @Query('since') since?: string,
    @Query('take') take?: string,
  ) {
    const n = take ? Number(take) : undefined;
    return this.audit.list(user, {
      resource,
      resourceId,
      action,
      collegeId,
      since,
      take: Number.isFinite(n) ? n : undefined,
    });
  }
}
